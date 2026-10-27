"""رمز عبور (Argon2) و توکن‌ها.

- access token: JWT کوتاه‌عمر (HS256) با `jti` یکتا؛ فقط در حافظه‌ی فرانت نگه داشته می‌شود.
- refresh token: رشته‌ی تصادفی مات (opaque)؛ فقط هش SHA-256 آن در DB ذخیره می‌شود و
  در کوکی HttpOnly به مرورگر می‌رود.
- هش‌کردن Argon2 پرهزینه است؛ در thread جدا اجرا می‌شود تا event loop قفل نشود، و تعداد محاسبه‌های
  هم‌زمان هر پروسه سقف دارد (`PASSWORD_HASH_CONCURRENCY`). آزمون بار ۲۰۲۶/۱۰/۲۶ نشان داد بدون این سقف،
  موج ورود API را تا ۹ هسته‌ی CPU و ۲٫۲ گیگابایت حافظه می‌برد و بقیه‌ی درخواست‌ها می‌خوابیدند.
"""

import asyncio
import hashlib
import secrets
import uuid
from datetime import timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings
from app.core.time import utcnow

ACCESS_TOKEN_TYPE = "access"
_ALGORITHM = "HS256"

_hasher = PasswordHasher()
# برای یکسان کردن زمان پاسخ وقتی ایمیل وجود ندارد (جلوگیری از کشف ایمیل‌ها با زمان‌سنجی)
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))
# درخواست‌های بیشتر از سقف، بدون نگه داشتن اتصال پایگاه داده، پشت همین سقف صف می‌کشند
_hash_slots = asyncio.Semaphore(settings.password_hash_concurrency)


async def hash_password(password: str) -> str:
    async with _hash_slots:
        return await asyncio.to_thread(_hasher.hash, password)


async def verify_password(password: str, hashed: str) -> bool:
    def _verify() -> bool:
        try:
            return _hasher.verify(hashed, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    async with _hash_slots:
        return await asyncio.to_thread(_verify)


async def burn_password_check(password: str) -> None:
    await verify_password(password, _DUMMY_HASH)


def password_needs_rehash(hashed: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


def create_access_token(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, role: str, version: int = 0
) -> tuple[str, int]:
    """توکن دسترسی و مدت اعتبار آن (ثانیه) را برمی‌گرداند.

    `ver` نسخه‌ی نشست‌های کاربر است؛ با تغییر یا بازیابی رمز بالا می‌رود و همه‌ی توکن‌های
    دسترسی قبلی بلافاصله (نه پس از ۱۵ دقیقه) بی‌اعتبار می‌شوند.
    """
    now = utcnow()
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "org": str(organization_id),
        "role": role,
        "ver": version,
        "type": ACCESS_TOKEN_TYPE,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + lifetime,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "jti", "type"]},
            leeway=10,
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        return None
    return payload


def create_signed_token(
    *, subject: str, token_type: str, ttl: timedelta, extra: dict[str, Any] | None = None
) -> str:
    """توکن کوتاه‌عمر امضاشده برای کارهای غیر از ورود (مثلاً لینک دانلود)؛ نوعش جدا بررسی می‌شود."""
    now = utcnow()
    payload = {
        "sub": subject,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + ttl,
        **(extra or {}),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_signed_token(token: str, token_type: str) -> dict[str, Any] | None:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "jti", "type"]},
        )
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == token_type else None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
