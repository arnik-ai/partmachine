"""ساخت حساب ادمین — تنها راه ساخت ادمین (نه از ثبت‌نام، نه از API).

    python -m app.create_admin --email admin@example.com --name "نام ادمین"

رمز به‌صورت پنهان دو بار پرسیده می‌شود. برای اسکریپت‌ها (مثلاً CI) رمز از ورودی استاندارد:

    printf '%s' "$ADMIN_PASSWORD" | python -m app.create_admin --email ... --name ... --password-stdin

اگر ادمینی با همین ایمیل وجود داشته باشد کاری انجام نمی‌شود (اجرای دوباره بی‌خطر است).
"""

import argparse
import asyncio
import getpass
import sys
import uuid
from dataclasses import dataclass

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.security import hash_password
from app.core.text import normalize_text
from app.db.session import SessionLocal, engine
from app.modules.audit import service as audit
from app.modules.identity.models import User
from app.modules.organizations.models import Organization

PLATFORM_ORGANIZATION = "تیم تراشینو"
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


class AdminSetupError(Exception):
    """خطای قابل‌نمایش به اپراتور (بدون stack trace)."""


@dataclass(frozen=True)
class AdminResult:
    user_id: uuid.UUID
    created: bool


def validate(email: str, full_name: str, password: str) -> tuple[str, str]:
    try:
        clean_email = TypeAdapter(EmailStr).validate_python(email.strip()).lower()
    except ValidationError:
        raise AdminSetupError("ایمیل معتبر نیست.") from None
    clean_name = normalize_text(full_name)
    if len(clean_name) < 2:
        raise AdminSetupError("نام ادمین را کامل وارد کنید.")
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise AdminSetupError(
            f"رمز ادمین باید بین {MIN_PASSWORD_LENGTH} و {MAX_PASSWORD_LENGTH} کاراکتر باشد."
        )
    return clean_email, clean_name


async def create_admin(email: str, full_name: str, password: str) -> AdminResult:
    clean_email, clean_name = validate(email, full_name, password)
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == clean_email))
        if existing is not None:
            if existing.role == "admin":
                return AdminResult(user_id=existing.id, created=False)
            raise AdminSetupError(
                "این ایمیل متعلق به یک کاربر عادی است؛ برای ادمین ایمیل جداگانه‌ای انتخاب کنید."
            )

        # همه‌ی ادمین‌ها عضو یک سازمان «تیم تراشینو»اند
        organization_id = await db.scalar(
            select(User.organization_id).where(User.role == "admin").limit(1)
        )
        first_admin = organization_id is None
        if organization_id is None:
            organization = Organization(id=uuid.uuid4(), name=PLATFORM_ORGANIZATION)
            db.add(organization)
            await db.flush()
            organization_id = organization.id

        user = User(
            id=uuid.uuid4(),
            organization_id=organization_id,
            email=clean_email,
            full_name=clean_name,
            hashed_password=await hash_password(password),
            role="admin",
            org_role="owner" if first_admin else "member",
            is_verified=True,
        )
        db.add(user)
        await db.flush()
        audit.record(
            db,
            action="admin.created",
            entity_type="user",
            entity_id=user.id,
            organization_id=organization_id,
            data={"via": "cli"},
        )
        await db.commit()
        return AdminResult(user_id=user.id, created=True)


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    first = getpass.getpass("رمز ادمین (حداقل ۱۲ کاراکتر): ")
    second = getpass.getpass("تکرار رمز: ")
    if first != second:
        raise AdminSetupError("دو رمز واردشده یکی نیستند.")
    return first


async def _main(args: argparse.Namespace) -> int:
    try:
        result = await create_admin(args.email, args.name, _read_password(args.password_stdin))
    except AdminSetupError as exc:
        print(f"خطا: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    if result.created:
        print(f"حساب ادمین ساخته شد: {args.email.strip().lower()}")
    else:
        print("ادمینی با این ایمیل از قبل وجود دارد؛ تغییری داده نشد.")
    return 0


def main() -> None:
    # خروجی فارسی در ترمینال یا pipe با کدگذاری غیر UTF-8 نباید برنامه را بشکند
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="ساخت حساب ادمین تراشینو")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, help="نام و نام خانوادگی ادمین")
    parser.add_argument(
        "--password-stdin", action="store_true", help="خواندن رمز از ورودی استاندارد"
    )
    raise SystemExit(asyncio.run(_main(parser.parse_args())))


if __name__ == "__main__":
    main()
