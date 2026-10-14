import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class Notification(Base, UUIDPrimaryKey):
    """اعلان داخل سایت برای یک کاربر (O10).

    در همان تراکنش رویداد اصلی ثبت می‌شود (اگر رویداد ثبت نشود، اعلان هم نیست) و فقط به اعضای
    فعال سازمان‌های ذی‌نفع همان رویداد می‌رسد. هر ردیف یک گیرنده است؛ پس «خوانده‌شده» برای هر
    کاربر جداست. ایمیل و پیامک پس از انتخاب سرویس (P8) از همین ردیف‌ها ساخته می‌شوند.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index(
            "ix_notifications_user_unread",
            "user_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # سازمان گیرنده هنگام ثبت؛ فهرست فقط اعلان‌های سازمان فعلی کاربر را نشان می‌دهد
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    # مسیر داخلی سایت (مثلاً /orders/…)؛ خالی یعنی بدون لینک
    link: Mapped[str] = mapped_column(String(300), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
