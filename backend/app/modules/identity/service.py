"""منطق احراز هویت: ثبت‌نام (با ساخت خودکار سازمان)، ورود، چرخش و ابطال نشست."""

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import Conflict, Forbidden, Unauthorized
from app.core.security import (
    burn_password_check,
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.identity.models import RefreshToken, User
from app.modules.identity.schemas import AuthSession, RegisterInput, UserOut
from app.modules.organizations.models import Organization
from app.modules.suppliers.models import Supplier

logger = logging.getLogger("partmachine.auth")

INVALID_CREDENTIALS = "ایمیل یا رمز عبور درست نیست."
SESSION_INVALID = "نشست شما معتبر نیست. لطفاً دوباره وارد شوید."
# دو تب که هم‌زمان نشست را تازه می‌کنند نباید کاربر را بیرون بیندازند
REUSE_GRACE = timedelta(seconds=20)


@dataclass
class IssuedSession:
    session: AuthSession
    refresh_token: str


def user_out(user: User, organization: Organization) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id,
        company_name=organization.name,
        verified=user.is_verified,
    )


def _issue(
    db: AsyncSession, user: User, organization: Organization, family_id: uuid.UUID | None = None
) -> tuple[IssuedSession, RefreshToken]:
    access_token, expires_in = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role
    )
    raw = new_refresh_token()
    token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        family_id=family_id or uuid.uuid4(),
        token_hash=hash_token(raw),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(token)
    session = AuthSession(
        user=user_out(user, organization), access_token=access_token, expires_in=expires_in
    )
    return IssuedSession(session=session, refresh_token=raw), token


async def register(db: AsyncSession, data: RegisterInput) -> IssuedSession:
    existing = await db.scalar(select(User.id).where(User.email == data.email))
    if existing is not None:
        raise Conflict("این ایمیل قبلاً ثبت شده است. اگر حساب دارید وارد شوید.", code="email_taken")

    hashed_password = await hash_password(data.password)
    organization = Organization(id=uuid.uuid4(), name=data.company_name or data.full_name)
    user = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hashed_password,
        role=data.role,
    )
    try:
        # ترتیب درج صریح است (بدون relationship): سازمان ← کاربر ← پروفایل ← نشست
        db.add(organization)
        await db.flush()
        db.add(user)
        await db.flush()
        if data.role == "supplier":
            # پروفایل پایه تا قطعه‌ساز بلافاصله بتواند قیمت بدهد؛ تکمیل پروفایل در فاز ۲
            db.add(Supplier(organization_id=organization.id, company_name=organization.name))
        issued, _ = _issue(db, user, organization)
        await db.commit()
    except IntegrityError:
        # ثبت‌نام هم‌زمان با یک ایمیل
        await db.rollback()
        raise Conflict(
            "این ایمیل قبلاً ثبت شده است. اگر حساب دارید وارد شوید.", code="email_taken"
        ) from None
    return issued


async def login(db: AsyncSession, email: str, password: str) -> IssuedSession:
    await rate_limit.ensure_below(rate_limit.LOGIN_FAILURES_PER_EMAIL, email)
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        await burn_password_check(password)
        await rate_limit.record(rate_limit.LOGIN_FAILURES_PER_EMAIL, email)
        raise Unauthorized(INVALID_CREDENTIALS, code="invalid_credentials")
    if not await verify_password(password, user.hashed_password):
        await rate_limit.record(rate_limit.LOGIN_FAILURES_PER_EMAIL, email)
        raise Unauthorized(INVALID_CREDENTIALS, code="invalid_credentials")
    if not user.is_active:
        raise Forbidden("حساب کاربری شما غیرفعال است. با پشتیبانی تماس بگیرید.", code="inactive")

    await rate_limit.reset(rate_limit.LOGIN_FAILURES_PER_EMAIL, email)
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = await hash_password(password)
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    issued, _ = _issue(db, user, organization)
    await db.commit()
    return issued


async def refresh(db: AsyncSession, raw_token: str) -> IssuedSession:
    """چرخش refresh token. استفاده‌ی مجدد از توکن باطل‌شده = سرقت احتمالی ⇒ ابطال کل خانواده."""
    token = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token))
        .with_for_update()
    )
    if token is None:
        raise Unauthorized(SESSION_INVALID, code="session_invalid")

    now = utcnow()
    if token.expires_at <= now:
        raise Unauthorized(SESSION_INVALID, code="session_expired")

    if token.revoked_at is not None:
        benign_race = token.replaced_by_id is not None and now - token.revoked_at <= REUSE_GRACE
        if not benign_race:
            revoked = await db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=now)
            )
            if revoked.rowcount:  # type: ignore[attr-defined]
                # فقط اولین تشخیص ثبت می‌شود؛ تلاش‌های بعدی با توکن مرده چیزی برای ابطال ندارند
                audit.record(
                    db,
                    action="auth.refresh_reuse_detected",
                    entity_type="user",
                    entity_id=token.user_id,
                    actor_user_id=token.user_id,
                )
                logger.warning("refresh token reuse detected; session family revoked")
            await db.commit()
            raise Unauthorized(SESSION_INVALID, code="session_revoked")

    user = await db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise Unauthorized(SESSION_INVALID, code="session_invalid")
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None

    issued, new_token = _issue(db, user, organization, family_id=token.family_id)
    if token.revoked_at is None:
        token.revoked_at = now
        token.replaced_by_id = new_token.id
    await db.commit()
    return issued


async def logout(db: AsyncSession, raw_token: str) -> None:
    token = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))
    )
    if token is None:
        return
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    await db.commit()


async def current_profile(db: AsyncSession, user_id: uuid.UUID) -> UserOut:
    user = await db.get(User, user_id)
    if user is None:
        raise Unauthorized(SESSION_INVALID, code="session_invalid")
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    return user_out(user, organization)
