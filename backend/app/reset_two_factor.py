"""خاموش کردن ورود دومرحله‌ای یک حساب از روی سرور، برای وقتی که گوشی و کدهای پشتیبان هر دو گم شده‌اند.

    python -m app.reset_two_factor --email admin@example.com

دسترسی به سرور خودش اثبات هویت مدیر سیستم است. همه‌ی نشست‌های آن حساب بسته می‌شوند و رویداد در
audit ثبت می‌شود. کاربر پس از ورود دوباره روشنش می‌کند؛ برای ادمین این کار اجباری است و تا آن موقع
بخش ادمین برایش باز نمی‌شود.
"""

import argparse
import asyncio
import sys

from sqlalchemy import delete, select, update

from app.core.time import utcnow
from app.db.session import SessionLocal, engine
from app.modules.audit import service as audit
from app.modules.identity.models import RecoveryCode, RefreshToken, User


class ResetError(Exception):
    """خطای قابل‌نمایش به اپراتور (بدون stack trace)."""


async def reset_two_factor(email: str) -> bool:
    """True یعنی خاموش شد؛ False یعنی از قبل خاموش بود."""
    async with SessionLocal() as db:
        user = await db.scalar(
            select(User).where(User.email == email.strip().lower()).with_for_update()
        )
        if user is None:
            raise ResetError("حسابی با این ایمیل پیدا نشد.")
        if user.totp_enabled_at is None:
            return False
        user.totp_secret = None
        user.totp_enabled_at = None
        user.totp_last_step = None
        user.token_version += 1
        await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        audit.record(
            db,
            action="auth.two_factor_reset",
            entity_type="user",
            entity_id=user.id,
            organization_id=user.organization_id,
            data={"via": "cli"},
        )
        await db.commit()
        return True


async def _main(email: str) -> int:
    try:
        changed = await reset_two_factor(email)
    except ResetError as exc:
        print(f"خطا: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    if changed:
        print("ورود دومرحله‌ای این حساب خاموش و همه‌ی نشست‌هایش بسته شد.")
    else:
        print("ورود دومرحله‌ای این حساب از قبل خاموش بود؛ تغییری داده نشد.")
    return 0


def main() -> None:
    # خروجی فارسی در ترمینال یا pipe با کدگذاری غیر UTF-8 نباید برنامه را بشکند
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="خاموش کردن ورود دومرحله‌ای یک حساب")
    parser.add_argument("--email", required=True)
    raise SystemExit(asyncio.run(_main(parser.parse_args().email)))


if __name__ == "__main__":
    main()
