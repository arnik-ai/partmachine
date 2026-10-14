"""رمز عبور (Argon2) و توکن‌ها.

- access token: JWT کوتاه‌عمر (HS256) با `jti` یکتا؛ فقط در حافظه‌ی فرانت نگه داشته می‌شود.
- refresh token: رشته‌ی تصادفی مات (opaque)؛ فقط هش SHA-256 آن در DB ذخیره می‌شود و
  در کوکی HttpOnly به مرورگر می‌رود.
- هش‌کردن Argon2 پرهزینه است؛ در thread جدا اجرا می‌شود تا event loop قفل نشود.
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


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hasher.hash, password)


async def verify_password(password: str, hashed: str) -> bool:
    def _verify() -> bool:
        try:
            return _hasher.verify(hashed, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    return await asyncio.to_thread(_verify)


async def burn_password_check(password: str) -> None:
    await verify_password(password, _DUMMY_HASH)


def password_needs_rehash(hashed: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


def create_access_token(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, role: str
) -> tuple[str, int]:
    """توکن دسترسی و مدت اعتبار آن (ثانیه) را برمی‌گرداند."""
    now = utcnow()
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "org": str(organization_id),
        "role": role,
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


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
