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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class OrderPayment(Base, UUIDPrimaryKey):
    """یک قسط سفارش طبق شرایط پرداخت قرارداد امضاشده (O6، O7).

    پول از پلتفرم عبور نمی‌کند: کارفرما پرداختِ انجام‌شده را با رسید یا شماره‌ی پیگیری اعلام
    می‌کند و قطعه‌ساز دریافت را تأیید یا با دلیل رد می‌کند (رد ⇒ دوباره «در انتظار»).
    """

    __tablename__ = "order_payments"
    __table_args__ = (
        UniqueConstraint("order_id", "number", name="uq_order_payments_order_number"),
        CheckConstraint("kind IN ('prepayment', 'final')", name="kind_valid"),
        CheckConstraint("status IN ('pending', 'reported', 'confirmed')", name="status_valid"),
        CheckConstraint("amount_rials > 0", name="amount_positive"),
        CheckConstraint("percent BETWEEN 1 AND 100", name="percent_range"),
        CheckConstraint("(status = 'pending') = (reported_at IS NULL)", name="reported_consistent"),
        CheckConstraint(
            "(status = 'confirmed') = (confirmed_at IS NOT NULL)", name="confirmed_consistent"
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    # prepayment: پیش از شروع تولید؛ final: پس از ارسال یا تحویل
    kind: Mapped[str] = mapped_column(String(20))
    percent: Mapped[int] = mapped_column(Integer)
    amount_rials: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")

    # اعلام پرداخت توسط کارفرما
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reported_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    paid_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference: Mapped[str] = mapped_column(String(100), default="", server_default="")
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    receipt_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="RESTRICT"), nullable=True
    )

    # تأیید یا رد توسط قطعه‌ساز
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
