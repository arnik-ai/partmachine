import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.text import search_text_sql
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey

RFQ_STATUSES = ("draft", "published", "quoting", "awarded", "closed", "cancelled")
# وضعیت‌های ذخیره‌شده‌ای که RFQ در آن‌ها هنوز باز است (قواعد دقیق در lifecycle.py)
OPEN_STATUSES = ("published", "quoting")

SEARCH_TEXT_SQL = search_text_sql("title || ' ' || description || ' ' || material")


class Rfq(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "rfqs"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("char_length(title) > 0", name="title_not_empty"),
        CheckConstraint(
            "status IN ('draft', 'published', 'quoting', 'awarded', 'closed', 'cancelled')",
            name="status_valid",
        ),
        CheckConstraint(
            "(status = 'awarded') = (awarded_quotation_id IS NOT NULL)",
            name="awarded_consistent",
        ),
        # برنده باید یکی از پیشنهادهای همین RFQ باشد (قید پایگاه داده، نه فقط کد)
        ForeignKeyConstraint(
            ["awarded_quotation_id", "id"],
            ["quotations.id", "quotations.rfq_id"],
            name="fk_rfqs_awarded_quotation",
            use_alter=True,
        ),
        CheckConstraint("quotes_due <= deadline", name="quotes_due_before_deadline"),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="cancelled_consistent"
        ),
        Index("ix_rfqs_org_created", "organization_id", "created_at"),
        Index("ix_rfqs_status_created", "status", "created_at"),
        # فید درخواست‌های باز برای قطعه‌سازها
        Index("ix_rfqs_open_feed", "status", "quotes_due"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    capability: Mapped[str] = mapped_column(String(50))
    material: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer)
    delivery_city: Mapped[str] = mapped_column(String(100))
    # مهلت تحویل قطعه‌ها به کارفرما
    deadline: Mapped[date] = mapped_column(Date)
    # آخرین روز ارسال یا ویرایش پیشنهاد قیمت (همیشه تا مهلت تحویل یا قبل از آن)
    quotes_due: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="published", server_default="published")
    # قدیمی (فاز ۱): فقط متادیتای بدون فایل واقعی؛ دیگر نوشته یا خوانده نمی‌شود. پیوست‌ها در جدول
    # files هستند. حذف این ستون یک migration مخرب است و به تأیید مالک نیاز دارد.
    files: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    awarded_quotation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    search_text: Mapped[str] = mapped_column(Text, Computed(SEARCH_TEXT_SQL, persisted=True))
