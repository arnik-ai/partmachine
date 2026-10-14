"""ادمین حداقلی: کاربران (فعال/غیرفعال، تأیید مأمور خرید و آزمایشگاه) و رویدادهای audit.

همه‌ی اقدام‌های ادمین در audit ثبت می‌شوند. حساب ادمین فقط با `python -m app.create_admin`
ساخته می‌شود و از این‌جا نه ساخته، نه غیرفعال می‌شود.
"""

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Conflict, NotFound
from app.core.text import escape_like, normalize_text
from app.core.time import utcnow
from app.modules.admin.schemas import (
    AdminUserOut,
    AdminUserPage,
    AuditEventOut,
    AuditEventPage,
)
from app.modules.audit import service as audit
from app.modules.audit.models import AuditEvent
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import RefreshToken, User
from app.modules.organizations.models import Organization
from app.modules.suppliers.models import Supplier

USER_NOT_FOUND = "کاربر موردنظر پیدا نشد."
# تأیید دستی فقط برای این نقش‌ها؛ قطعه‌سازها از صف تأیید مدارک تأیید می‌شوند
MANUALLY_VERIFIED_ROLES = ("agent", "qc")


def _user_select():  # type: ignore[no-untyped-def]
    return (
        select(User, Organization.name, Supplier.id, Supplier.verified)
        .join(Organization, Organization.id == User.organization_id)
        .outerjoin(Supplier, Supplier.organization_id == User.organization_id)
    )


def _user_out(
    user: User,
    organization_name: str,
    supplier_id: uuid.UUID | None,
    supplier_verified: bool | None,
) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        org_role=user.org_role,
        organization_id=user.organization_id,
        organization_name=organization_name,
        is_active=user.is_active,
        verified=user.is_verified,
        supplier_id=supplier_id if user.role == "supplier" else None,
        supplier_verified=supplier_verified if user.role == "supplier" else None,
        created_at=user.created_at,
    )


async def list_users(
    db: AsyncSession,
    *,
    q: str | None,
    role: str | None,
    active: bool | None,
    limit: int,
    offset: int,
) -> AdminUserPage:
    stmt = _user_select()
    if q and normalize_text(q):
        pattern = f"%{escape_like(normalize_text(q).lower())}%"
        stmt = stmt.where(
            or_(
                User.email.like(pattern, escape="\\"),
                func.lower(User.full_name).like(pattern, escape="\\"),
                func.lower(Organization.name).like(pattern, escape="\\"),
            )
        )
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.execute(
            stmt.order_by(User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)
        )
    ).all()
    return AdminUserPage(
        items=[_user_out(*row) for row in rows], total=total, limit=limit, offset=offset
    )


async def _user_for_update(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise NotFound(USER_NOT_FOUND)
    return user


async def _one(db: AsyncSession, user_id: uuid.UUID) -> AdminUserOut:
    row = (await db.execute(_user_select().where(User.id == user_id))).one()
    return _user_out(*row)


async def set_active(
    db: AsyncSession, admin: CurrentUser, user_id: uuid.UUID, *, active: bool, reason: str
) -> AdminUserOut:
    """غیرفعال‌سازی همه‌ی نشست‌های کاربر را هم باطل می‌کند؛ دسترسی بلافاصله قطع می‌شود."""
    user = await _user_for_update(db, user_id)
    if user.role == "admin":
        raise Conflict("حساب ادمین از پنل مدیریت تغییر نمی‌کند.", code="admin_account_protected")
    if user.is_active != active:
        user.is_active = active
        if not active:
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=utcnow())
            )
        audit.record(
            db,
            action="admin.user_activated" if active else "admin.user_deactivated",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=admin.id,
            organization_id=user.organization_id,
            data={"reason": reason} if reason else {},
        )
        await db.commit()
    return await _one(db, user.id)


async def set_verified(
    db: AsyncSession, admin: CurrentUser, user_id: uuid.UUID, *, verified: bool, reason: str
) -> AdminUserOut:
    user = await _user_for_update(db, user_id)
    if user.role not in MANUALLY_VERIFIED_ROLES:
        raise Conflict(
            "تأیید قطعه‌سازها از صف تأیید مدارک انجام می‌شود؛ این‌جا فقط مأمور خرید و "
            "آزمایشگاه تأیید می‌شوند.",
            code="not_manually_verifiable",
        )
    if user.is_verified != verified:
        user.is_verified = verified
        audit.record(
            db,
            action="admin.user_verified" if verified else "admin.user_unverified",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=admin.id,
            organization_id=user.organization_id,
            data={"reason": reason} if reason else {},
        )
        await db.commit()
    return await _one(db, user.id)


def _day_start(day: date) -> datetime:
    """آغاز روز به وقت کسب‌وکار (تهران)، تا فیلتر تاریخ با تقویم کاربر هم‌خوان باشد."""
    return datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.business_timezone))


async def list_audit_events(
    db: AsyncSession,
    *,
    action: str | None,
    actor_email: str | None,
    organization_id: uuid.UUID | None,
    entity_id: uuid.UUID | None,
    since: date | None,
    until: date | None,
    limit: int,
    offset: int,
) -> AuditEventPage:
    stmt = (
        select(AuditEvent, User.full_name, User.email, Organization.name)
        .outerjoin(User, User.id == AuditEvent.actor_user_id)
        .outerjoin(Organization, Organization.id == AuditEvent.organization_id)
    )
    if action:
        # «verification» همه‌ی verification.* را می‌آورد؛ «file.downloaded» فقط همان را
        stmt = stmt.where(
            or_(
                AuditEvent.action == action,
                AuditEvent.action.like(f"{escape_like(action)}.%", escape="\\"),
            )
        )
    if actor_email:
        stmt = stmt.where(User.email == actor_email.strip().lower())
    if organization_id:
        stmt = stmt.where(AuditEvent.organization_id == organization_id)
    if entity_id:
        stmt = stmt.where(AuditEvent.entity_id == entity_id)
    if since:
        stmt = stmt.where(AuditEvent.created_at >= _day_start(since))
    if until:
        stmt = stmt.where(AuditEvent.created_at < _day_start(until + timedelta(days=1)))
    rows = (
        await db.execute(
            stmt.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(limit + 1)
            .offset(offset)
        )
    ).all()
    items = [
        AuditEventOut(
            id=event.id,
            created_at=event.created_at,
            action=event.action,
            actor_id=event.actor_user_id,
            actor_name=actor_name,
            actor_email=actor_email_value,
            organization_id=event.organization_id,
            organization_name=organization_name,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            data=event.data or {},
            request_id=event.request_id,
        )
        for event, actor_name, actor_email_value, organization_name in rows[:limit]
    ]
    return AuditEventPage(items=items, has_more=len(rows) > limit, limit=limit, offset=offset)
