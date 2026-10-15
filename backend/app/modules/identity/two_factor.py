"""ورود دومرحله‌ای با اپ‌های Authenticator (TOTP، RFC 6238؛ گام 4e، S7).

- برای ادمین اجباری است (`ADMIN_TWO_FACTOR_REQUIRED`): ادمینی که روشنش نکرده، تا روشن کردنش هیچ
  دسترسی ادمینی ندارد (`CurrentUser.admin_locked`). برای بقیه اختیاری است.
- کلید مخفی با کلیدی که از SECRET_KEY مشتق می‌شود رمزگذاری و ذخیره می‌شود. نسخه‌ی خوانا فقط یک بار،
  هنگام روشن کردن، به خود کاربر نشان داده می‌شود.
- هر کد فقط یک بار پذیرفته می‌شود (آخرین گام زمانی ذخیره می‌شود). یک گام قبل و بعد هم برای اختلاف
  ساعت گوشی قبول است.
- ۱۰ کد پشتیبان یک‌بارمصرف برای روز گم شدن گوشی؛ فقط هش آن‌ها ذخیره می‌شود.
- کد اشتباه محدود است (`TWO_FACTOR_FAILURES_PER_USER`).

اگر SECRET_KEY عوض شود، کلیدهای ذخیره‌شده خوانده نمی‌شوند و کاربران باید دوباره روشنش کنند
(`python -m app.reset_two_factor`).
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Literal

import pyotp
import segno
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import Conflict, Forbidden, Unauthorized, field_error
from app.core.security import create_signed_token, decode_signed_token, verify_password
from app.core.text import ascii_digits
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import RecoveryCode, User
from app.modules.identity.schemas import (
    TwoFactorChallengeOut,
    TwoFactorCodeInput,
    TwoFactorEnableInput,
    TwoFactorSetupOut,
)

ISSUER = "PartMachine"
SETUP_TOKEN = "totp_setup"
LOGIN_TOKEN = "login_2fa"
SETUP_TTL = timedelta(minutes=10)
LOGIN_TTL = timedelta(minutes=5)
RECOVERY_CODE_COUNT = 10
# بدون حروف و ارقام شبیه به هم (i، l، o، 0، 1)
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

WRONG_CODE = "کد درست نیست. کد تازه‌ی اپ را وارد کنید و ساعت گوشی را بررسی کنید."
WRONG_PASSWORD = "رمز درست نیست."
LOGIN_EXPIRED = "مهلت ورود تمام شد. دوباره ایمیل و رمز را وارد کنید."
SETUP_EXPIRED = "زمان این QR گذشته است. دوباره از اول شروع کنید."
ADMIN_REQUIRED = "برای حساب ادمین ورود دومرحله‌ای اجباری است و خاموش نمی‌شود."


@lru_cache
def _fernet() -> Fernet:
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"partmachine-totp-v1").derive(
        settings.secret_key.encode()
    )
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def normalize(code: str) -> str:
    """ارقام فارسی به لاتین، بدون فاصله و خط تیره، با حروف کوچک."""
    return ascii_digits(code).replace(" ", "").replace("-", "").strip().lower()


def matched_step(secret: str, code: str, now: datetime) -> int | None:
    """گام زمانی کد، اگر درست باشد (گام فعلی، یکی قبل یا یکی بعد)."""
    if len(code) != 6 or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    current = totp.timecode(now)
    for offset in (0, -1, 1):
        if hmac.compare_digest(totp.at(now, offset), code):
            return current + offset
    return None


def _hash_code(code: str) -> str:
    return hashlib.sha256(normalize(code).encode()).hexdigest()


def _new_recovery_codes(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
        db.add(RecoveryCode(id=uuid.uuid4(), user_id=user_id, code_hash=_hash_code(raw)))
    return codes


async def _verify_code(
    db: AsyncSession, user: User, code: str
) -> Literal["app", "recovery"] | None:
    """کد اپ یا کد پشتیبان را می‌پذیرد و مصرف می‌کند. ردیف کاربر باید قفل باشد."""
    clean = normalize(code)
    if len(clean) == 6 and clean.isdigit():
        secret = decrypt_secret(user.totp_secret or "")
        step = matched_step(secret, clean, utcnow()) if secret else None
        if step is None or (user.totp_last_step is not None and step <= user.totp_last_step):
            return None
        user.totp_last_step = step
        return "app"
    recovery = await db.scalar(
        select(RecoveryCode)
        .where(
            RecoveryCode.user_id == user.id,
            RecoveryCode.code_hash == _hash_code(clean),
            RecoveryCode.used_at.is_(None),
        )
        .with_for_update()
    )
    if recovery is None:
        return None
    recovery.used_at = utcnow()
    return "recovery"


async def _check_code(db: AsyncSession, user: User, code: str) -> Literal["app", "recovery"]:
    subject = str(user.id)
    await rate_limit.ensure_below(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)
    method = await _verify_code(db, user, code)
    if method is None:
        await rate_limit.record(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)
        raise field_error("code", WRONG_CODE)
    await rate_limit.reset(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)
    return method


async def _check_password(user: User, password: str) -> None:
    subject = str(user.id)
    await rate_limit.ensure_below(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
    if not await verify_password(password, user.hashed_password):
        await rate_limit.record(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
        raise field_error("password", WRONG_PASSWORD)
    await rate_limit.reset(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)


async def _locked(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None or not user.is_active:
        raise Unauthorized(LOGIN_EXPIRED, code="session_invalid")
    return user


# --- روشن و خاموش کردن -----------------------------------------------------------------------


async def setup(db: AsyncSession, current: CurrentUser) -> TwoFactorSetupOut:
    user = await db.get(User, current.id)
    if user is None:
        raise Unauthorized(LOGIN_EXPIRED, code="session_invalid")
    if user.totp_enabled_at is not None:
        raise Conflict("ورود دومرحله‌ای از قبل روشن است.", code="two_factor_enabled")
    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)
    token = create_signed_token(
        subject=str(user.id),
        token_type=SETUP_TOKEN,
        ttl=SETUP_TTL,
        extra={"s": encrypt_secret(secret), "ver": user.token_version},
    )
    return TwoFactorSetupOut(
        secret=secret,
        otpauth_uri=uri,
        qr_code=segno.make(uri, error="m").svg_data_uri(scale=5, border=2),
        setup_token=token,
        expires_in=int(SETUP_TTL.total_seconds()),
    )


async def enable(db: AsyncSession, current: CurrentUser, data: TwoFactorEnableInput) -> list[str]:
    payload = decode_signed_token(data.setup_token, SETUP_TOKEN)
    if payload is None or payload.get("sub") != str(current.id):
        raise field_error("code", SETUP_EXPIRED)
    user = await _locked(db, current.id)
    if payload.get("ver") != user.token_version:
        raise field_error("code", SETUP_EXPIRED)
    if user.totp_enabled_at is not None:
        raise Conflict("ورود دومرحله‌ای از قبل روشن است.", code="two_factor_enabled")
    await _check_password(user, data.password)
    secret = decrypt_secret(str(payload.get("s", "")))
    subject = str(user.id)
    await rate_limit.ensure_below(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)
    step = matched_step(secret, normalize(data.code), utcnow()) if secret else None
    if secret is None or step is None:
        await rate_limit.record(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)
        raise field_error("code", WRONG_CODE)
    await rate_limit.reset(rate_limit.TWO_FACTOR_FAILURES_PER_USER, subject)

    user.totp_secret = encrypt_secret(secret)
    user.totp_enabled_at = utcnow()
    user.totp_last_step = step
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = _new_recovery_codes(db, user.id)
    _record(db, user, "auth.two_factor_enabled")
    await db.commit()
    return codes


async def disable(db: AsyncSession, current: CurrentUser, data: TwoFactorCodeInput) -> None:
    if current.role == "admin" and settings.admin_two_factor_required:
        raise Forbidden(ADMIN_REQUIRED, code="two_factor_required_for_admin")
    user = await _locked(db, current.id)
    if user.totp_enabled_at is None:
        raise Conflict("ورود دومرحله‌ای روشن نیست.", code="two_factor_disabled")
    await _check_password(user, data.password)
    await _check_code(db, user, data.code)
    user.totp_secret = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    _record(db, user, "auth.two_factor_disabled")
    await db.commit()


async def regenerate_codes(
    db: AsyncSession, current: CurrentUser, data: TwoFactorCodeInput
) -> list[str]:
    user = await _locked(db, current.id)
    if user.totp_enabled_at is None:
        raise Conflict("ورود دومرحله‌ای روشن نیست.", code="two_factor_disabled")
    await _check_password(user, data.password)
    await _check_code(db, user, data.code)
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = _new_recovery_codes(db, user.id)
    _record(db, user, "auth.recovery_codes_regenerated")
    await db.commit()
    return codes


def _record(db: AsyncSession, user: User, action: str, **data: object) -> None:
    audit.record(
        db,
        action=action,
        entity_type="user",
        entity_id=user.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data=data or None,
    )


# --- مرحله‌ی دوم ورود ------------------------------------------------------------------------


def challenge(user: User) -> TwoFactorChallengeOut:
    token = create_signed_token(
        subject=str(user.id),
        token_type=LOGIN_TOKEN,
        ttl=LOGIN_TTL,
        extra={"ver": user.token_version},
    )
    return TwoFactorChallengeOut(challenge=token, expires_in=int(LOGIN_TTL.total_seconds()))


async def verify_login(db: AsyncSession, challenge_token: str, code: str) -> User:
    """کد مرحله‌ی دوم را بررسی می‌کند و کاربر قفل‌شده را برمی‌گرداند (نشست را فراخواننده می‌سازد)."""
    payload = decode_signed_token(challenge_token, LOGIN_TOKEN)
    if payload is None:
        raise Unauthorized(LOGIN_EXPIRED, code="two_factor_expired")
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except ValueError:
        raise Unauthorized(LOGIN_EXPIRED, code="two_factor_expired") from None
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if (
        user is None
        or not user.is_active
        or user.totp_enabled_at is None
        or payload.get("ver") != user.token_version
    ):
        raise Unauthorized(LOGIN_EXPIRED, code="two_factor_expired")
    method = await _check_code(db, user, code)
    if method == "recovery":
        left = await db.scalar(
            select(RecoveryCode.id)
            .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
            .limit(1)
        )
        _record(db, user, "auth.recovery_code_used", codes_left=left is not None)
    return user
