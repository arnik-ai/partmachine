"""اعلان‌های داخل سایت (O10): ثبت در تراکنش رویداد اصلی، فهرست، شمارنده‌ی خوانده‌نشده‌ها.

`notify` و `notify_user` چیزی commit نمی‌کنند؛ فراخواننده پس از ثبت رویداد اصلی commit می‌کند،
پس اعلانِ رویدادی که ثبت نشده هرگز دیده نمی‌شود. کسی که خودش کاری کرده برای همان کار اعلان
نمی‌گیرد (`exclude_user_id`).
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.time import utcnow
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationOut, NotificationPage, UnreadCountOut

TITLE_MAX = 200
BODY_MAX = 1000


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
    db.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            organization_id=organization_id,
            kind=kind,
            title=_clip(title, TITLE_MAX),
            body=_clip(body, BODY_MAX),
            link=link,
            created_at=utcnow(),
        )
    )


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
