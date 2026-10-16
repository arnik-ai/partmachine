import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class StoredFile(Base, UUIDPrimaryKey):
    """فایل خصوصی (نقشه، مدرک، تصویر). محتوا در Storage است و فقط فراداده اینجا ذخیره می‌شود.

    نام اصلی فایل فقط برای نمایش است؛ کلید ذخیره‌سازی را سرور می‌سازد.
    """

    __tablename__ = "files"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('rfq_attachment', 'verification_document', 'portfolio_image', "
            "'order_document', 'logo')",
            name="purpose_valid",
        ),
        CheckConstraint("kind IN ('pdf', 'cad', 'drawing', 'image')", name="kind_valid"),
        CheckConstraint("size_bytes > 0", name="size_positive"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    purpose: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(20))
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    # پیوست RFQ؛ تا پیش از ثبت RFQ خالی است
    rfq_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rfqs.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # مدرک تأیید هویت؛ پس از ارسال درخواست پر می‌شود و فایل دیگر حذف‌شدنی نیست
    verification_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("verification_requests.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # سند یک سفارش (بارنامه، رسید، گزارش بازرسی)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )

    @property
    def is_attached(self) -> bool:
        return (
            self.rfq_id is not None
            or self.verification_request_id is not None
            or self.order_id is not None
        )
