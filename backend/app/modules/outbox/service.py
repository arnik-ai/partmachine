"""صف ارسال ایمیل و پیامک اعلان‌ها (S9).

- `enqueue`: در تراکنش ثبت اعلان، فقط وقتی ارسال‌کننده‌ای روشن است. تا انتخاب و تأیید سرویس پیامک
  یا ایمیل، در تولید خاموش است و چیزی در صف گذاشته نمی‌شود.
- `send_due`: کار worker. هر پیام در تراکنش جدای خود فرستاده می‌شود؛ اگر worker وسط کار متوقف شود،
  حداکثر یک پیام دوباره فرستاده می‌شود.

تلاش دوباره‌ی محدود: پس از هر شکست با فاصله‌ی بیشتری دوباره امتحان می‌شود. پس از `MAX_ATTEMPTS`
بار، پیام «failed» می‌ماند و خطای آن در لاگ و در خود ردیف دیده می‌شود.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.messaging import get_message_sender, mask
from app.core.time import utcnow
from app.db.session import SessionLocal
from app.modules.identity.models import User
from app.modules.notifications.models import Notification
from app.modules.outbox.models import OutboxMessage

logger = logging.getLogger("partmachine.outbox")

MAX_ATTEMPTS = 5
# فاصله‌ی تلاش بعدی پس از هر شکست
RETRY_DELAYS = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=30),
    timedelta(hours=2),
)
BATCH_SIZE = 50
FOOTER = "این پیام خودکار از تراشینو است."


def enqueue(db: AsyncSession, notification_id: uuid.UUID) -> None:
    """ایمیل همین اعلان را در صف می‌گذارد (در تراکنش فراخواننده)."""
    if not get_message_sender().enabled:
        return
    now = utcnow()
    db.add(
        OutboxMessage(
            id=uuid.uuid4(),
            notification_id=notification_id,
            channel="email",
            created_at=now,
            next_attempt_at=now,
        )
    )


def render(notification: Notification) -> str:
    parts = [notification.body] if notification.body else []
    if notification.link:
        parts.append(f"{settings.site_url.rstrip('/')}{notification.link}")
    parts.append(FOOTER)
    return "\n\n".join(parts)


async def send_one(db: AsyncSession, now: datetime) -> str | None:
    """یک پیام سررسیده را می‌فرستد و نتیجه را برمی‌گرداند؛ None یعنی پیام سررسیده‌ای نمانده است."""
    row = (
        await db.execute(
            select(OutboxMessage, Notification, User.email, User.is_active)
            .join(Notification, Notification.id == OutboxMessage.notification_id)
            .join(User, User.id == Notification.user_id)
            .where(OutboxMessage.status == "pending", OutboxMessage.next_attempt_at <= now)
            .order_by(OutboxMessage.next_attempt_at)
            .limit(1)
            .with_for_update(of=OutboxMessage, skip_locked=True)
        )
    ).first()
    if row is None:
        return None
    message, notification, email, is_active = row
    if not is_active:
        message.status = "skipped"
        await db.commit()
        return "skipped"

    message.attempts += 1
    try:
        await get_message_sender().send_message(
            channel="email",
            destination=email,
            subject=notification.title,
            body=render(notification),
        )
    except Exception as exc:
        message.last_error = f"{type(exc).__name__}: {exc}"[:300]
        gave_up = message.attempts >= MAX_ATTEMPTS
        if gave_up:
            message.status = "failed"
        else:
            message.next_attempt_at = now + RETRY_DELAYS[message.attempts - 1]
        logger.warning(
            "message to %s failed (attempt %s): %s",
            mask(email),
            message.attempts,
            message.last_error,
        )
        await db.commit()
        return "failed" if gave_up else "retry"
    message.status = "sent"
    message.sent_at = now
    message.last_error = None
    await db.commit()
    return "sent"


async def send_due(limit: int = BATCH_SIZE) -> dict[str, int]:
    """کار worker: پیام‌های سررسیده را، هر کدام در تراکنش جدا، می‌فرستد."""
    counts = {"sent": 0, "retry": 0, "failed": 0, "skipped": 0}
    if not get_message_sender().enabled:
        return counts
    for _ in range(limit):
        async with SessionLocal() as db:
            outcome = await send_one(db, utcnow())
        if outcome is None:
            break
        counts[outcome] += 1
    return counts
