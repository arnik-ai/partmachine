"""ذخیره‌ی فایل پشت یک رابط کوچک، با دو پیاده‌سازی:

- `LocalStorage`: دیسک محلی؛ در توسعه زیر `var/storage` و در تولید روی یک volume پایدار
  (`STORAGE_LOCAL_DIR`).
- `S3Storage`: هر فضای ابری S3-سازگار (مثل لیارا، ابر آروان یا AWS) با `STORAGE_BACKEND=s3`.

فایل‌ها همیشه خصوصی‌اند: هیچ لینک عمومی یا presigned ساخته نمی‌شود و دانلود فقط از راه API، با
همان قواعد دسترسی و لینک کوتاه‌عمر انجام می‌شود.

کلید فایل همیشه توسط سرور ساخته می‌شود (`<organization_id>/<file_id>`) و هرگز از نام فایل کاربر
نمی‌آید؛ با این حال مسیر یا کلید نهایی بررسی می‌شود تا از ریشه‌ی ذخیره‌سازی بیرون نرود.
"""

import asyncio
import hashlib
import os
import re
import shutil
import tempfile
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import Settings, settings

CHUNK_SIZE = 64 * 1024
HEAD_BYTES = 4096
# فایل‌های کوچک‌تر از این پیش از ارسال به S3 در حافظه می‌مانند و بزرگ‌ترها در فایل موقت
SPOOL_MEMORY_BYTES = 1024 * 1024
S3_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*")


class FileTooLarge(Exception):
    pass


@dataclass(frozen=True)
class WriteResult:
    size: int
    sha256: str
    # چند کیلوبایت اول، برای تشخیص نوع واقعی فایل
    head: bytes


class Storage(Protocol):
    async def write(
        self, key: str, chunks: AsyncIterator[bytes], *, max_bytes: int
    ) -> WriteResult: ...

    def read(self, key: str) -> AsyncIterator[bytes]: ...

    async def delete(self, key: str) -> None: ...

    def free_bytes(self) -> int | None:
        """فضای آزاد دیسکی که فایل‌ها رویش نوشته می‌شوند؛ None یعنی دیسک محلی در کار نیست (S3)."""
        ...


class LocalStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def free_bytes(self) -> int | None:
        # پایگاه داده معمولاً روی همین دیسک است؛ پر شدنش با فایل کاربران، کل سایت را می‌خواباند
        self.root.mkdir(parents=True, exist_ok=True)
        return shutil.disk_usage(self.root).free

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("invalid storage key")
        return path

    async def write(self, key: str, chunks: AsyncIterator[bytes], *, max_bytes: int) -> WriteResult:
        """فایل را تکه‌تکه می‌نویسد؛ اگر از سقف بگذرد یا خطایی رخ دهد، فایل نیمه‌کاره پاک می‌شود."""
        path = self._path(key)
        partial = path.with_name(path.name + ".part")
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        digest = hashlib.sha256()
        head = bytearray()
        size = 0
        handle = await asyncio.to_thread(open, partial, "wb")
        try:
            async for chunk in chunks:
                if not chunk:
                    continue
                size += len(chunk)
                if size > max_bytes:
                    raise FileTooLarge
                digest.update(chunk)
                if len(head) < HEAD_BYTES:
                    head.extend(chunk[: HEAD_BYTES - len(head)])
                await asyncio.to_thread(handle.write, chunk)
        except BaseException:
            await asyncio.to_thread(handle.close)
            await asyncio.to_thread(partial.unlink, missing_ok=True)
            raise
        await asyncio.to_thread(handle.close)
        await asyncio.to_thread(os.replace, partial, path)
        return WriteResult(size=size, sha256=digest.hexdigest(), head=bytes(head))

    async def read(self, key: str) -> AsyncIterator[bytes]:
        path = self._path(key)
        handle = await asyncio.to_thread(open, path, "rb")
        try:
            while chunk := await asyncio.to_thread(handle.read, CHUNK_SIZE):
                yield chunk
        finally:
            await asyncio.to_thread(handle.close)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, missing_ok=True)


def is_missing(error: ClientError) -> bool:
    code = str(error.response.get("Error", {}).get("Code", ""))
    status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in ("NoSuchKey", "NotFound", "404") or status == 404


class S3Storage:
    """فضای S3-سازگار. boto3 همگام است، پس هر فراخوانی شبکه در یک thread جدا اجرا می‌شود
    (client آن thread-safe است) تا بقیه‌ی درخواست‌ها منتظر نمانند."""

    def __init__(self, client: Any, bucket: str, prefix: str = "") -> None:
        self.client = client
        self.bucket = bucket
        clean = prefix.strip("/")
        self.prefix = f"{clean}/" if clean else ""

    def free_bytes(self) -> int | None:
        return None

    def object_key(self, key: str) -> str:
        if not S3_KEY.fullmatch(key) or ".." in key:
            raise ValueError("invalid storage key")
        return self.prefix + key

    async def write(self, key: str, chunks: AsyncIterator[bytes], *, max_bytes: int) -> WriteResult:
        """فایل اول کامل دریافت می‌شود (سقف حجم، hash و چند کیلوبایت اول همان‌جا بررسی می‌شوند) و بعد
        یک‌جا فرستاده می‌شود. PUT در S3 اتمی است، پس فایل نیمه‌کاره هرگز ذخیره نمی‌شود."""
        object_key = self.object_key(key)
        digest = hashlib.sha256()
        head = bytearray()
        size = 0
        with tempfile.SpooledTemporaryFile(max_size=SPOOL_MEMORY_BYTES) as spool:
            async for chunk in chunks:
                if not chunk:
                    continue
                size += len(chunk)
                if size > max_bytes:
                    raise FileTooLarge
                digest.update(chunk)
                if len(head) < HEAD_BYTES:
                    head.extend(chunk[: HEAD_BYTES - len(head)])
                await asyncio.to_thread(spool.write, chunk)
            await asyncio.to_thread(spool.seek, 0)
            await asyncio.to_thread(
                self.client.put_object,
                Bucket=self.bucket,
                Key=object_key,
                Body=spool,
                ContentLength=size,
                # نوع واقعی را API هنگام دانلود می‌فرستد؛ این‌جا هیچ‌وقت قابل نمایش در مرورگر نیست
                ContentType="application/octet-stream",
            )
        return WriteResult(size=size, sha256=digest.hexdigest(), head=bytes(head))

    async def read(self, key: str) -> AsyncIterator[bytes]:
        object_key = self.object_key(key)
        try:
            response = await asyncio.to_thread(
                self.client.get_object, Bucket=self.bucket, Key=object_key
            )
        except ClientError as error:
            if is_missing(error):
                raise FileNotFoundError(key) from None
            raise
        body = response["Body"]
        try:
            while chunk := await asyncio.to_thread(body.read, CHUNK_SIZE):
                yield chunk
        finally:
            body.close()

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(
            self.client.delete_object, Bucket=self.bucket, Key=self.object_key(key)
        )

    async def size(self, key: str) -> int | None:
        """حجم فایل ذخیره‌شده، یا None اگر نباشد."""
        try:
            response = await asyncio.to_thread(
                self.client.head_object, Bucket=self.bucket, Key=self.object_key(key)
            )
        except ClientError as error:
            if is_missing(error):
                return None
            raise
        return int(response["ContentLength"])


def s3_client(config: Settings) -> Any:
    return boto3.session.Session().client(
        "s3",
        endpoint_url=config.s3_endpoint_url or None,
        region_name=config.s3_region,
        aws_access_key_id=config.s3_access_key_id,
        aws_secret_access_key=config.s3_secret_access_key.get_secret_value(),
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": config.s3_addressing_style},
            # بسیاری از سرویس‌های S3-سازگار checksumهای تازه‌ی AWS را نمی‌شناسند؛ فقط هر جا لازم است
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=5,
            read_timeout=60,
            max_pool_connections=32,
        ),
    )


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        if settings.storage_backend == "s3":
            _storage = S3Storage(s3_client(settings), settings.s3_bucket, settings.s3_prefix)
        else:
            _storage = LocalStorage(settings.storage_local_dir)
    return _storage
