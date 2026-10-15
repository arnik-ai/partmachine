"""منطق احراز هویت: ثبت‌نام (با ساخت خودکار سازمان)، ورود، چرخش و ابطال نشست، تغییر و بازیابی
رمز، و تأیید موبایل با کد یک‌بارمصرف."""

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import Conflict, Forbidden, Unauthorized, field_error
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
from app.modules.agreements import service as agreements
from app.modules.agreements.catalog import SIGNUP_AGREEMENT_BY_ROLE
from app.modules.audit import service as audit
from app.modules.identity import otp, two_factor
from app.modules.identity.deps import ClientInfo, CurrentUser
from app.modules.identity.models import RefreshToken, User
from app.modules.identity.schemas import (
    AuthSession,
    ChangePasswordInput,
    PasswordResetConfirmInput,
    PhoneVerifyInput,
    RegisterInput,
    TwoFactorChallengeOut,
    TwoFactorLoginInput,
    UserOut,
)
from app.modules.notifications import service as notifications
from app.modules.organizations import service as organizations
from app.modules.organizations.models import Organization
from app.modules.suppliers.models import Supplier

logger = logging.getLogger("partmachine.auth")

INVALID_CREDENTIALS = "ایمیل یا رمز عبور درست نیست."
RESET_SENT = "اگر حسابی با این ایمیل وجود داشته باشد، کد بازیابی برایش فرستاده شد."
PHONE_SENT = "کد تأیید به این شماره فرستاده شد."
PHONE_TAKEN = "این شماره برای حساب دیگری تأیید شده است."
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
        org_role=user.org_role,
        phone=user.phone,
        two_factor_enabled=user.totp_enabled_at is not None,
    )


def _issue(
    db: AsyncSession, user: User, organization: Organization, family_id: uuid.UUID | None = None
) -> tuple[IssuedSession, RefreshToken]:
    access_token, expires_in = create_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        role=user.role,
        version=user.token_version,
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


async def register(
    db: AsyncSession, data: RegisterInput, client: ClientInfo | None = None
) -> IssuedSession:
    if data.invite_token:
        return await _register_with_invite(db, data, data.invite_token, client)
    # پذیرش قوانین نقش در سرور هم الزامی است، نه فقط در فرم
    agreement = agreements.require_accepted(
        data.accepted_agreements, SIGNUP_AGREEMENT_BY_ROLE[data.role]
    )
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
        agreements.record(
            db,
            agreement=agreement,
            user_id=user.id,
            organization_id=organization.id,
            client=client,
        )
        issued, _ = _issue(db, user, organization)
        await db.commit()
    except IntegrityError:
        # ثبت‌نام هم‌زمان با یک ایمیل
        await db.rollback()
        raise Conflict(
            "این ایمیل قبلاً ثبت شده است. اگر حساب دارید وارد شوید.", code="email_taken"
        ) from None
    return issued


async def _register_with_invite(
    db: AsyncSession, data: RegisterInput, token: str, client: ClientInfo | None
) -> IssuedSession:
    """ثبت‌نام با لینک دعوت: عضو همان سازمان، با نقش کاری مدیر آن؛ دعوت یک‌بارمصرف است."""
    invite = await organizations.find_usable_invite(db, token, for_update=True)
    if invite is None:
        raise field_error("inviteToken", organizations.INVITE_INVALID)
    role = invite.user_role
    agreement = agreements.require_accepted(
        data.accepted_agreements, SIGNUP_AGREEMENT_BY_ROLE[role]
    )
    existing = await db.scalar(select(User.id).where(User.email == data.email))
    if existing is not None:
        raise Conflict("این ایمیل قبلاً ثبت شده است. اگر حساب دارید وارد شوید.", code="email_taken")
    organization = await db.get(Organization, invite.organization_id)
    assert organization is not None

    user = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        email=data.email,
        full_name=data.full_name,
        hashed_password=await hash_password(data.password),
        role=role,
        org_role="member",
    )
    try:
        db.add(user)
        await db.flush()
        invite.accepted_at = utcnow()
        invite.accepted_by_id = user.id
        agreements.record(
            db, agreement=agreement, user_id=user.id, organization_id=organization.id, client=client
        )
        await notifications.notify(
            db,
            organization_id=organization.id,
            kind="member_joined",
            title=f"{user.full_name} به سازمان پیوست",
            body="عضو تازه با لینک دعوت ثبت‌نام کرد.",
            link="/organization",
            exclude_user_id=user.id,
        )
        audit.record(
            db,
            action="organization.member_joined",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=user.id,
            organization_id=organization.id,
            data={"invite_id": str(invite.id)},
        )
        issued, _ = _issue(db, user, organization)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise Conflict(
            "این ایمیل قبلاً ثبت شده است. اگر حساب دارید وارد شوید.", code="email_taken"
        ) from None
    return issued


async def login(
    db: AsyncSession, email: str, password: str
) -> IssuedSession | TwoFactorChallengeOut:
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
    if user.totp_enabled_at is not None:
        # رمز درست است؛ نشست فقط پس از کد اپ (مرحله‌ی دوم) ساخته می‌شود
        await db.commit()
        return two_factor.challenge(user)
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    issued, _ = _issue(db, user, organization)
    await db.commit()
    return issued


async def complete_two_factor_login(db: AsyncSession, data: TwoFactorLoginInput) -> IssuedSession:
    """مرحله‌ی دوم ورود: کد اپ یا کد پشتیبان، و بعد نشست."""
    user = await two_factor.verify_login(db, data.challenge, data.code)
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


# --- حساب کاربری -----------------------------------------------------------------------------


async def _revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


async def _replace_password(
    db: AsyncSession, user: User, new_password: str, *, action: str
) -> None:
    """رمز تازه و باطل شدن همه‌ی نشست‌ها و توکن‌های قبلی (همه‌ی دستگاه‌ها)؛ commit با فراخواننده."""
    user.hashed_password = await hash_password(new_password)
    user.token_version += 1
    await _revoke_all_sessions(db, user.id)
    audit.record(
        db,
        action=action,
        entity_type="user",
        entity_id=user.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
    )


async def _new_session(db: AsyncSession, user: User) -> IssuedSession:
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    issued, _ = _issue(db, user, organization)
    await db.commit()
    return issued


async def _locked_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None or not user.is_active:
        raise Unauthorized(SESSION_INVALID, code="session_invalid")
    return user


async def change_password(
    db: AsyncSession, current: CurrentUser, data: ChangePasswordInput
) -> IssuedSession:
    subject = str(current.id)
    await rate_limit.ensure_below(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
    user = await _locked_user(db, current.id)
    if not await verify_password(data.current_password, user.hashed_password):
        await rate_limit.record(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
        raise field_error("currentPassword", "رمز فعلی درست نیست.")
    await rate_limit.reset(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
    if data.new_password == data.current_password:
        raise field_error("newPassword", "رمز جدید باید با رمز فعلی فرق داشته باشد.")
    await _replace_password(db, user, data.new_password, action="auth.password_changed")
    # کاربر همین حالا (با مرحله‌ی دوم، اگر روشن باشد) وارد شده است؛ همین مرورگر نشست تازه می‌گیرد
    return await _new_session(db, user)


async def request_password_reset(db: AsyncSession, email: str, ip: str) -> None:
    """پاسخ برای ایمیل موجود و ناموجود یکسان است تا فهرست کاربران لو نرود."""
    await otp.throttle(purpose="password_reset", subject=email, destination=email, ip=ip)
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active:
        return
    await otp.issue(purpose="password_reset", subject=email, channel="email", destination=email)


async def confirm_password_reset(
    db: AsyncSession, data: PasswordResetConfirmInput
) -> IssuedSession | TwoFactorChallengeOut:
    await otp.consume(purpose="password_reset", subject=data.email, code=data.code)
    user = await db.scalar(select(User).where(User.email == data.email).with_for_update())
    if user is None or not user.is_active:
        raise field_error("code", otp.CODE_EXPIRED)
    await _replace_password(db, user, data.new_password, action="auth.password_reset")
    # حسابی که ورود دومرحله‌ای دارد نشست نمی‌گیرد و باید کد اپ را هم وارد کند؛ وگرنه بازیابی رمز
    # راهی برای دور زدن مرحله‌ی دوم می‌شد
    result: IssuedSession | TwoFactorChallengeOut
    if user.totp_enabled_at is not None:
        await db.commit()
        result = two_factor.challenge(user)
    else:
        result = await _new_session(db, user)
    # کسی که رمز را از راه ایمیل بازیابی کرده نباید به‌خاطر تلاش‌های ناموفق قبلی قفل بماند
    await rate_limit.reset(rate_limit.LOGIN_FAILURES_PER_EMAIL, user.email)
    return result


def _phone_subject(user_id: uuid.UUID, phone: str) -> str:
    return f"{user_id}:{phone}"


async def request_phone_code(db: AsyncSession, current: CurrentUser, phone: str, ip: str) -> None:
    owner = await db.scalar(select(User.id).where(User.phone == phone))
    if owner == current.id:
        raise field_error("phone", "این شماره همین حالا برای حساب شما تأیید شده است.")
    if owner is not None:
        raise field_error("phone", PHONE_TAKEN)
    subject = _phone_subject(current.id, phone)
    await otp.throttle(purpose="phone_verification", subject=subject, destination=phone, ip=ip)
    await otp.issue(purpose="phone_verification", subject=subject, channel="sms", destination=phone)


async def verify_phone(db: AsyncSession, current: CurrentUser, data: PhoneVerifyInput) -> UserOut:
    await otp.consume(
        purpose="phone_verification",
        subject=_phone_subject(current.id, data.phone),
        code=data.code,
    )
    user = await _locked_user(db, current.id)
    user.phone = data.phone
    user.phone_verified_at = utcnow()
    audit.record(
        db,
        action="auth.phone_verified",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
    )
    try:
        await db.commit()
    except IntegrityError:
        # هم‌زمان حساب دیگری همین شماره را تأیید کرد
        await db.rollback()
        raise field_error("phone", PHONE_TAKEN) from None
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    return user_out(user, organization)
