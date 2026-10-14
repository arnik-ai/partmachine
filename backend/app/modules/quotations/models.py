import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class Quotation(Base, UUIDPrimaryKey, TimestampMixin):
    """پیشنهاد قیمت یک قطعه‌ساز برای یک RFQ.

    پول: `total_price_rials` عدد صحیح به **ریال** (BIGINT، بدون اعشار و بدون float).
    """

    __tablename__ = "quotations"
    __table_args__ = (
        # هر قطعه‌ساز برای هر RFQ یک پیشنهاد؛ ویرایش، پس‌گرفتن و ثبت دوباره روی همین ردیف
        UniqueConstraint("rfq_id", "supplier_id", name="uq_quotations_rfq_supplier"),
        # هدف کلید خارجی ترکیبی rfqs.awarded_quotation_id
        UniqueConstraint("id", "rfq_id", name="uq_quotations_id_rfq"),
        CheckConstraint("total_price_rials > 0", name="price_positive"),
        CheckConstraint("lead_time_days > 0", name="lead_time_positive"),
        CheckConstraint("status IN ('active', 'withdrawn')", name="status_valid"),
        CheckConstraint(
            "(status = 'withdrawn') = (withdrawn_at IS NOT NULL)", name="withdrawn_consistent"
        ),
        CheckConstraint("revision >= 1", name="revision_positive"),
    )

    rfq_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rfqs.id", ondelete="RESTRICT"), index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    submitted_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    total_price_rials: Mapped[int] = mapped_column(BigInteger)
    lead_time_days: Mapped[int] = mapped_column(Integer)
    valid_until: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # active: معتبر و قابل انتخاب؛ withdrawn: پس‌گرفته‌شده توسط قطعه‌ساز (قابل ثبت دوباره تا پایان مهلت)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # هر ویرایش یا ثبت دوباره یک واحد اضافه می‌کند؛ جزئیات هر نسخه در audit_events است
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
