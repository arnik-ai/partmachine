"""اعلان‌های داخل سایت (O10): ثبت در تراکنش رویداد اصلی، فهرست، شمارنده‌ی خوانده‌نشده‌ها.

`notify` و `notify_user` چیزی commit نمی‌کنند؛ فراخواننده پس از ثبت رویداد اصلی commit می‌کند،
پس اعلانِ رویدادی که ثبت نشده هرگز دیده نمی‌شود. کسی که خودش کاری کرده برای همان کار اعلان
نمی‌گیرد (`exclude_user_id`).

اگر ارسال ایمیل روشن باشد (فعلاً فقط در توسعه؛ در تولید پس از انتخاب سرویس، S9)، ایمیل هر اعلان در
همان تراکنش در صف ارسال گذاشته می‌شود و worker آن را می‌فرستد.

اعلان‌های خوانده‌شده پس از `READ_RETENTION_DAYS` روز پاک می‌شوند (کار worker). اعلان فقط رونوشتی
برای فهرست است؛ تاریخچه‌ی کامل هر سفارش در رویدادهای همان سفارش می‌ماند.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.time import utcnow
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationOut, NotificationPage, UnreadCountOut
from app.modules.outbox import service as outbox

TITLE_MAX = 200
BODY_MAX = 1000
READ_RETENTION_DAYS = 180
DELETE_BATCH = 5000
# سقف هر اجرا تا تراکنش‌ها کوتاه بمانند؛ باقی‌مانده در اجرای بعدی پاک می‌شود
DELETE_MAX_BATCHES = 20


def _clip(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _add(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    link: str,
) -> None:
    notification_id = uuid.uuid4()
    db.add(
        Notification(
            id=notification_id,
            user_id=user_id,
            organization_id=organization_id,
            kind=kind,
            title=_clip(title, TITLE_MAX),
            body=_clip(body, BODY_MAX),
            link=link,
            created_at=utcnow(),
        )
    )
    outbox.enqueue(db, notification_id)


async def notify(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    kind: str,
    title: str,
    body: str = "",
    link: str = "",
    exclude_user_id: uuid.UUID | None = None,
) -> None:
    """اعلان برای همه‌ی اعضای فعال یک سازمان (در تراکنش فراخواننده)."""
    members = await db.scalars(
        select(User.id).where(User.organization_id == organization_id, User.is_active.is_(True))
    )
    for user_id in members:
        if user_id != exclude_user_id:
            _add(
                db,
                user_id=user_id,
                organization_id=organization_id,
                kind=kind,
                title=title,
                body=body,
                link=link,
            )


def notify_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    kind: str,
    title: str,
    body: str = "",
    link: str = "",
) -> None:
    """اعلان برای یک کاربر مشخص، مثلاً تأیید حساب او (در تراکنش فراخواننده)."""
    _add(
        db,
        user_id=user_id,
        organization_id=organization_id,
        kind=kind,
        title=title,
        body=body,
        link=link,
    )


async def notify_admins(
    db: AsyncSession, *, kind: str, title: str, body: str = "", link: str = ""
) -> None:
    """اعلان برای همه‌ی ادمین‌های فعال، مثلاً اختلاف تازه در صف بررسی (در تراکنش فراخواننده)."""
    admins = await db.execute(
        select(User.id, User.organization_id).where(User.role == "admin", User.is_active.is_(True))
    )
    for user_id, organization_id in admins:
        _add(
            db,
            user_id=user_id,
            organization_id=organization_id,
            kind=kind,
            title=title,
            body=body,
            link=link,
        )


def _mine(user: CurrentUser):  # type: ignore[no-untyped-def]
    return (
        Notification.user_id == user.id,
        Notification.organization_id == user.organization_id,
    )


def _out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        kind=notification.kind,
        title=notification.title,
        body=notification.body,
        link=notification.link,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


async def unread_count(db: AsyncSession, user: CurrentUser) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(*_mine(user), Notification.read_at.is_(None))
    )
    return count or 0


async def list_notifications(
    db: AsyncSession, user: CurrentUser, *, unread_only: bool, limit: int, offset: int
) -> NotificationPage:
    conditions = list(_mine(user))
    if unread_only:
        conditions.append(Notification.read_at.is_(None))
    rows = await db.scalars(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await db.scalar(select(func.count()).select_from(Notification).where(*conditions))
    return NotificationPage(
        items=[_out(n) for n in rows],
        total=total or 0,
        unread=await unread_count(db, user),
        limit=limit,
        offset=offset,
    )


async def mark_read(
    db: AsyncSession, user: CurrentUser, notification_id: uuid.UUID
) -> NotificationOut:
    notification = await db.scalar(
        select(Notification).where(Notification.id == notification_id, *_mine(user))
    )
    if notification is None:
        raise NotFound("اعلان موردنظر پیدا نشد.")
    if notification.read_at is None:
        notification.read_at = utcnow()
        await db.commit()
    return _out(notification)


async def mark_all_read(db: AsyncSession, user: CurrentUser) -> UnreadCountOut:
    await db.execute(
        update(Notification)
        .where(*_mine(user), Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    await db.commit()
    return UnreadCountOut(unread=0)


async def delete_old_read(db: AsyncSession, *, now: datetime) -> int:
    """کار worker: اعلان‌های خوانده‌شده‌ی قدیمی‌تر از `READ_RETENTION_DAYS` روز را دسته‌دسته پاک می‌کند."""
    cutoff = now - timedelta(days=READ_RETENTION_DAYS)
    deleted = 0
    for _ in range(DELETE_MAX_BATCHES):
        batch = (
            select(Notification.id)
            .where(Notification.read_at.is_not(None), Notification.created_at < cutoff)
            .limit(DELETE_BATCH)
        )
        result = await db.execute(delete(Notification).where(Notification.id.in_(batch)))
        await db.commit()
        count = result.rowcount or 0  # type: ignore[attr-defined]
        deleted += count
        if count < DELETE_BATCH:
            break
    return deleted
