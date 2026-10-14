"""ذخیره‌ی فایل پشت یک رابط کوچک.

فعلاً فقط دیسک محلی پیاده شده است: در توسعه زیر `var/storage` و در تولید روی یک volume پایدار
(`STORAGE_LOCAL_DIR`). پیاده‌سازی S3-سازگار پس از انتخاب سرویس در فاز ۴ با همین رابط اضافه می‌شود.

کلید فایل همیشه توسط سرور ساخته می‌شود (`<organization_id>/<file_id>`) و هرگز از نام فایل کاربر
نمی‌آید؛ با این حال مسیر نهایی بررسی می‌شود تا از ریشه‌ی ذخیره‌سازی بیرون نرود.
"""

import asyncio
import hashlib
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import settings

CHUNK_SIZE = 64 * 1024
HEAD_BYTES = 4096


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


class LocalStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

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


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = LocalStorage(settings.storage_local_dir)
    return _storage
