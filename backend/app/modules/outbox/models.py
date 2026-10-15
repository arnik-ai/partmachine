import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class OutboxMessage(Base, UUIDPrimaryKey):
    """ایمیل یا پیامکی که باید برای یک اعلان فرستاده شود (صف ارسال، S9).

    در همان تراکنش اعلان ثبت می‌شود، پس اعلانی بی‌پیام یا پیامی بی‌اعلان نمی‌ماند. worker آن را با
    تلاش دوباره‌ی محدود می‌فرستد. تا انتخاب سرویس پیامک یا ایمیل، در تولید چیزی در صف گذاشته نمی‌شود.
    گیرنده و متن هنگام ارسال از اعلان و حساب کاربر خوانده می‌شوند.
    """

    __tablename__ = "outbox_messages"
    __table_args__ = (
        CheckConstraint("channel IN ('email', 'sms')", name="channel_valid"),
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'skipped')", name="status_valid"),
        CheckConstraint("attempts >= 0", name="attempts_non_negative"),
        Index(
            "ix_outbox_messages_due",
            "next_attempt_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
