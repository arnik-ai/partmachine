"""انتقال فایل‌ها از دیسک محلی به فضای S3 — یک‌بار، هنگام رفتن از دیسک به فضای ابری.

    STORAGE_BACKEND=s3 S3_BUCKET=... python -m app.copy_files_to_s3

فهرست فایل‌ها از پایگاه داده (جدول files) خوانده می‌شود و هر فایل از `STORAGE_LOCAL_DIR` (یا
`--from-dir`) به S3 فرستاده می‌شود. hash هر فایل با مقدار ثبت‌شده هنگام بارگذاری مقایسه می‌شود و
فایلی که نخواند منتقل نمی‌شود.

اجرای دوباره بی‌خطر است: فایلی که با همان حجم در S3 هست دوباره فرستاده نمی‌شود.
فایل‌های دیسک پاک نمی‌شوند؛ پس از بررسی سایت، خودتان پاکشان کنید.
"""

import argparse
import asyncio
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import select

from app.core.config import settings
from app.core.storage import FileTooLarge, LocalStorage, S3Storage, get_storage, is_missing
from app.core.text import fa_digits
from app.db.session import SessionLocal, engine
from app.modules.files.models import StoredFile


class CopySetupError(Exception):
    """خطای قابل‌نمایش به اپراتور (بدون stack trace)."""


@dataclass(frozen=True)
class FileRow:
    key: str
    size: int
    sha256: str


@dataclass
class CopyReport:
    copied: int = 0
    already_there: int = 0
    missing: list[str] = field(default_factory=list)
    damaged: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.missing and not self.damaged


async def copy_files(
    source: LocalStorage, target: S3Storage, rows: Iterable[FileRow]
) -> CopyReport:
    report = CopyReport()
    for row in rows:
        if await target.size(row.key) == row.size:
            report.already_there += 1
            continue
        try:
            written = await target.write(row.key, source.read(row.key), max_bytes=row.size)
        except FileNotFoundError:
            report.missing.append(row.key)
            continue
        except FileTooLarge:
            report.damaged.append(row.key)
            continue
        if written.sha256 != row.sha256:
            await target.delete(row.key)
            report.damaged.append(row.key)
            continue
        report.copied += 1
    return report


async def load_rows() -> list[FileRow]:
    async with SessionLocal() as db:
        result = await db.execute(
            select(StoredFile.storage_key, StoredFile.size_bytes, StoredFile.sha256).order_by(
                StoredFile.created_at
            )
        )
        return [FileRow(key=key, size=size, sha256=sha256) for key, size, sha256 in result.all()]


async def prepare_bucket(target: S3Storage) -> None:
    """اتصال و دسترسی به bucket را می‌سنجد. در توسعه bucket نبود ساخته می‌شود؛ در staging و
    production هرگز، چون bucket خصوصی را باید خودتان در پنل سرویس بسازید."""
    try:
        await asyncio.to_thread(target.client.head_bucket, Bucket=target.bucket)
        return
    except BotoCoreError:
        raise CopySetupError(
            f"به سرویس S3 وصل نشد ({settings.s3_endpoint_url or 'AWS'}). آدرس S3_ENDPOINT_URL"
            " و اینترنت سرور را بررسی کنید."
        ) from None
    except ClientError as error:
        if not is_missing(error):
            raise CopySetupError(
                f"دسترسی به bucket «{target.bucket}» ممکن نشد. S3_ACCESS_KEY_ID،"
                " S3_SECRET_ACCESS_KEY و دسترسی کلید به این bucket را بررسی کنید."
            ) from None
    if settings.is_production_like:
        raise CopySetupError(
            f"bucket «{target.bucket}» پیدا نشد. آن را در پنل سرویس با دسترسی خصوصی بسازید."
        )
    await asyncio.to_thread(target.client.create_bucket, Bucket=target.bucket)


async def run(from_dir: str) -> CopyReport:
    target = get_storage()
    if not isinstance(target, S3Storage):
        raise CopySetupError(
            "اول تنظیمات S3 را بگذارید: STORAGE_BACKEND=s3 به‌همراه S3_BUCKET،"
            " S3_ACCESS_KEY_ID و S3_SECRET_ACCESS_KEY."
        )
    await prepare_bucket(target)
    return await copy_files(LocalStorage(from_dir), target, await load_rows())


async def _main(args: argparse.Namespace) -> int:
    problems = settings.problems()
    try:
        if problems:
            raise CopySetupError("تنظیمات کامل نیست:\n- " + "\n- ".join(problems))
        report = await run(args.from_dir)
    except CopySetupError as exc:
        print(f"خطا: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    print(f"منتقل شد: {fa_digits(report.copied)} فایل")
    print(f"از قبل در S3 بود: {fa_digits(report.already_there)} فایل")
    for key in report.missing:
        print(f"روی دیسک پیدا نشد: {key}", file=sys.stderr)
    for key in report.damaged:
        print(f"با hash ثبت‌شده نمی‌خواند و منتقل نشد: {key}", file=sys.stderr)
    return 0 if report.ok else 1


def main() -> None:
    # خروجی فارسی در ترمینال یا pipe با کدگذاری غیر UTF-8 نباید برنامه را بشکند
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="انتقال فایل‌های تراشینو از دیسک به فضای S3")
    parser.add_argument(
        "--from-dir",
        default=settings.storage_local_dir,
        help="پوشه‌ی فایل‌ها روی دیسک (پیش‌فرض: STORAGE_LOCAL_DIR)",
    )
    raise SystemExit(asyncio.run(_main(parser.parse_args())))


if __name__ == "__main__":
    main()
