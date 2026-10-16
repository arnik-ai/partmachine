import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey

ORDER_STATUSES = (
    "awaiting_contract",
    "awaiting_prepayment",
    "awaiting_material",
    "in_production",
    "in_inspection",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "disputed",
)
_STATUS_SQL = ", ".join(f"'{status}'" for status in ORDER_STATUSES)


class Order(Base, UUIDPrimaryKey, TimestampMixin):
    """سفارشی که پس از انتخاب برنده ساخته می‌شود (O1): برای هر RFQ دقیقاً یکی.

    مشخصات کار (عنوان، تعداد، مبلغ و…) هنگام ساخت از RFQ و پیشنهاد برنده کپی می‌شود تا سفارش و
    قرارداد به تغییرات بعدی وابسته نباشند. چرخه‌ی وضعیت در `orders/lifecycle.py` تعریف شده است.
    """

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUS_SQL})", name="status_valid"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("amount_rials > 0", name="amount_positive"),
        CheckConstraint(
            "buyer_organization_id <> supplier_organization_id", name="distinct_parties"
        ),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)",
            name="cancelled_consistent",
        ),
        CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)", name="completed_consistent"
        ),
        CheckConstraint(
            "cancel_requested_side IS NULL OR cancel_requested_side IN ('buyer', 'supplier')",
            name="cancel_requested_side_valid",
        ),
        CheckConstraint(
            "(cancel_requested_side IS NULL) = (cancel_requested_at IS NULL)",
            name="cancel_request_consistent",
        ),
    )

    # شماره‌ی خوانا برای کاربر (PM-1001، …)؛ شناسه‌ی اصلی همان UUID است
    number: Mapped[int] = mapped_column(BigInteger, Identity(start=1001), unique=True)
    rfq_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rfqs.id", ondelete="RESTRICT"), unique=True
    )
    quotation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quotations.id", ondelete="RESTRICT"), unique=True
    )
    buyer_organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    supplier_organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"))

    title: Mapped[str] = mapped_column(String(200))
    material: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer)
    delivery_city: Mapped[str] = mapped_column(String(100))
    amount_rials: Mapped[int] = mapped_column(BigInteger)
    lead_time_days: Mapped[int] = mapped_column(Integer)
    # تاریخ تحویل تعهدشده؛ پیش از امضای قرارداد کارفرما می‌تواند آن را تغییر دهد (O5)
    delivery_due: Mapped[date] = mapped_column(Date)
    # کارفرما قطعه یا مواد اولیه را برای مجری می‌فرستد ⇒ مهلت تحویل از روز رسیدن آن شمرده می‌شود
    material_from_buyer: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    material_received_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(
        String(30), default="awaiting_contract", server_default="awaiting_contract"
    )
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # پس از امضای قرارداد، لغو فقط با توافق دو طرف است (O11): یک طرف درخواست می‌دهد و طرف دیگر
    # موافقت می‌کند (لغو) یا نمی‌کند (ادامه‌ی سفارش)
    cancel_requested_side: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_request_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)


class OrderEvent(Base, UUIDPrimaryKey):
    """تاریخچه‌ی سفارش (فقط افزودنی): هر تغییر وضعیت با انجام‌دهنده، توضیح و پیوست اختیاری."""

    __tablename__ = "order_events"
    __table_args__ = (
        CheckConstraint(
            "actor_side IN ('buyer', 'supplier', 'qc', 'admin', 'system')", name="actor_side_valid"
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    action: Mapped[str] = mapped_column(String(40))
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    actor_side: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )


REMINDER_KINDS = ("due_soon", "overdue")


class OrderReminder(Base):
    """یادآوری خودکار موعد تحویل که برای یک سفارش فرستاده شده است (کار پس‌زمینه‌ی گام 4d).

    کلید (سفارش، نوع) تضمین می‌کند هر یادآوری فقط یک بار فرستاده شود، حتی اگر worker دوباره اجرا شود.
    """

    __tablename__ = "order_reminders"
    __table_args__ = (
        CheckConstraint(
            "kind IN (" + ", ".join(f"'{kind}'" for kind in REMINDER_KINDS) + ")",
            name="kind_valid",
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
