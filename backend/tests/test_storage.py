"""فضای S3-سازگار (گام 4c فاز ۴): نوشتن، خواندن و حذف روی یک سرور S3 واقعی، و ابزار انتقال فایل‌ها
از دیسک. این تست‌ها فقط با `TEST_STORAGE_BACKEND=s3` اجرا می‌شوند؛ در آن حالت همه‌ی تست‌های دیگر
(بارگذاری، دانلود و قواعد دسترسی) هم روی همان سرور اجرا می‌شوند. CI هر دو حالت را اجرا می‌کند."""

import hashlib
import os
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from app import copy_files_to_s3 as copy_tool
from app.copy_files_to_s3 import CopySetupError, FileRow, copy_files, run
from app.core.config import settings
from app.core.storage import (
    CHUNK_SIZE,
    HEAD_BYTES,
    SPOOL_MEMORY_BYTES,
    FileTooLarge,
    LocalStorage,
    S3Storage,
    get_storage,
    s3_client,
)
from tests.helpers import PDF_BYTES, register, stored_keys, upload_file

needs_s3 = pytest.mark.skipif(
    settings.storage_backend != "s3", reason="needs TEST_STORAGE_BACKEND=s3 and a local S3 server"
)


async def chunks_of(*parts: bytes) -> AsyncIterator[bytes]:
    for part in parts:
        yield part


def s3() -> S3Storage:
    storage = get_storage()
    assert isinstance(storage, S3Storage)
    return storage


async def read_all(key: str) -> bytes:
    return b"".join([chunk async for chunk in s3().read(key)])


@needs_s3
@pytest.mark.parametrize("size", [3 * CHUNK_SIZE + 17, SPOOL_MEMORY_BYTES + 1])
async def test_write_read_delete_round_trip(size: int) -> None:
    # دومی از سقف حافظه می‌گذرد و پیش از ارسال در فایل موقت جمع می‌شود
    data = os.urandom(size)
    result = await s3().write(
        "org/file-1", chunks_of(data[:1000], b"", data[1000:]), max_bytes=size
    )
    assert result.size == size
    assert result.sha256 == hashlib.sha256(data).hexdigest()
    assert result.head == data[:HEAD_BYTES]
    assert await read_all("org/file-1") == data
    assert await s3().size("org/file-1") == size
    assert stored_keys() == ["org/file-1"]

    await s3().delete("org/file-1")
    assert stored_keys() == []
    await s3().delete("org/file-1")  # حذف دوباره بی‌خطر است


@needs_s3
async def test_too_large_or_interrupted_uploads_leave_nothing_behind() -> None:
    with pytest.raises(FileTooLarge):
        await s3().write("org/big", chunks_of(b"x" * 600, b"x" * 600), max_bytes=1000)

    async def interrupted() -> AsyncIterator[bytes]:
        yield b"partial"
        raise ConnectionError("client went away")

    with pytest.raises(ConnectionError):
        await s3().write("org/broken", interrupted(), max_bytes=1000)
    assert stored_keys() == []


@needs_s3
async def test_missing_files() -> None:
    with pytest.raises(FileNotFoundError):
        await read_all("org/missing")
    assert await s3().size("org/missing") is None


@needs_s3
async def test_files_are_private() -> None:
    # فایل بدون امضای معتبر (مثلاً با حدس زدن آدرس) خوانده نمی‌شود؛ دانلود فقط از راه API است
    await s3().write("org/private", chunks_of(b"secret drawing"), max_bytes=100)
    url = f"{settings.s3_endpoint_url}/{s3().bucket}/{s3().prefix}org/private"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
    assert response.status_code == 403
    assert b"secret drawing" not in response.content


@needs_s3
def test_storage_keys_are_checked() -> None:
    for bad in ("../outside", "/absolute", "a//b", "a/../b", "", "a/", ".hidden", "نقشه"):
        with pytest.raises(ValueError):
            s3().object_key(bad)
    assert s3().object_key("org/file") == f"{s3().prefix}org/file"


@needs_s3
async def test_copy_tool_moves_disk_files_once(tmp_path: Path) -> None:
    disk = LocalStorage(tmp_path)
    first = await disk.write("org/a", chunks_of(PDF_BYTES), max_bytes=10_000)
    second = await disk.write("org/b", chunks_of(b"second file"), max_bytes=10_000)
    rows = [
        FileRow("org/a", first.size, first.sha256),
        FileRow("org/b", second.size, second.sha256),
        FileRow("org/gone", 10, "0" * 64),
    ]
    report = await copy_files(disk, s3(), rows)
    assert (report.copied, report.already_there) == (2, 0)
    assert report.missing == ["org/gone"] and report.damaged == []
    assert await read_all("org/a") == PDF_BYTES

    # اجرای دوباره چیزی را دوباره نمی‌فرستد
    again = await copy_files(disk, s3(), rows[:2])
    assert (again.copied, again.already_there, again.ok) == (0, 2, True)
    assert stored_keys() == ["org/a", "org/b"]


@needs_s3
async def test_copy_tool_refuses_files_that_changed_on_disk(tmp_path: Path) -> None:
    disk = LocalStorage(tmp_path)
    written = await disk.write("org/a", chunks_of(b"original"), max_bytes=100)
    (tmp_path / "org" / "a").write_bytes(b"tampered")  # همان حجم، محتوای دیگر
    report = await copy_files(disk, s3(), [FileRow("org/a", written.size, written.sha256)])
    assert report.damaged == ["org/a"] and not report.ok
    assert stored_keys() == []


@needs_s3
async def test_copy_tool_reads_the_file_list_from_the_database(
    client: httpx.AsyncClient, tmp_path: Path
) -> None:
    buyer = await register(client)
    assert (await upload_file(buyer)).status_code == 201
    [key] = stored_keys()
    # سروری که تا امروز فایل‌ها را روی دیسک نگه می‌داشت
    await s3().delete(key)
    await LocalStorage(tmp_path).write(key, chunks_of(PDF_BYTES), max_bytes=10_000)

    report = await run(str(tmp_path))
    assert (report.copied, report.ok) == (1, True)
    assert stored_keys() == [key]


@needs_s3
async def test_copy_tool_creates_a_missing_bucket_only_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    absent = S3Storage(s3().client, "partmachine-absent-test")
    monkeypatch.setattr(copy_tool.settings, "environment", "production")
    with pytest.raises(CopySetupError, match="پنل سرویس"):
        await copy_tool.prepare_bucket(absent)

    monkeypatch.setattr(copy_tool.settings, "environment", "development")
    await copy_tool.prepare_bucket(absent)
    try:
        absent.client.head_bucket(Bucket=absent.bucket)
    finally:
        absent.client.delete_bucket(Bucket=absent.bucket)


@needs_s3
async def test_copy_tool_explains_wrong_keys() -> None:
    wrong = settings.model_copy(update={"s3_secret_access_key": SecretStr("wrong-secret")})
    storage = S3Storage(s3_client(wrong), s3().bucket, s3().prefix)
    with pytest.raises(CopySetupError, match="S3_SECRET_ACCESS_KEY"):
        await copy_tool.prepare_bucket(storage)


@pytest.mark.skipif(settings.storage_backend == "s3", reason="checks the disk-only setup")
async def test_copy_tool_explains_missing_s3_settings(tmp_path: Path) -> None:
    with pytest.raises(CopySetupError, match="STORAGE_BACKEND=s3"):
        await run(str(tmp_path))
