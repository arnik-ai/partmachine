import uuid
from datetime import date
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
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

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey

RFQ_STATUSES = ("draft", "published", "quoting", "awarded", "closed", "cancelled")
# وضعیت‌هایی که هنوز قیمت جدید و انتخاب برنده را می‌پذیرند
OPEN_STATUSES = ("published", "quoting")


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
        Index("ix_rfqs_org_created", "organization_id", "created_at"),
        Index("ix_rfqs_status_created", "status", "created_at"),
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
    deadline: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="published", server_default="published")
    # فعلاً فقط متادیتای فایل (نام/حجم/نوع)؛ ذخیره‌ی واقعی فایل در فاز ۲ (S3 خصوصی)
    files: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    awarded_quotation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
