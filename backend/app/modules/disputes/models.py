import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class OrderDispute(Base, UUIDPrimaryKey):
    """«اعلام مشکل» یکی از دو طرف پس از امضای قرارداد (O11).

    سفارش تا تصمیم پشتیبانی در وضعیت «اختلاف» متوقف می‌ماند. ادمین با دلیل یکی از سه تصمیم را
    ثبت می‌کند: ادامه‌ی سفارش از همان مرحله‌ی قبلی (resume)، تکمیل (complete) یا لغو (cancel).
    پول از پلتفرم عبور نمی‌کند؛ تصمیم فقط وضعیت سفارش در پلتفرم را تعیین می‌کند. هر سفارش در هر
    لحظه حداکثر یک اختلاف باز دارد؛ اختلاف‌های بسته‌شده برای سابقه می‌مانند.
    """

    __tablename__ = "order_disputes"
    __table_args__ = (
        CheckConstraint("opened_side IN ('buyer', 'supplier')", name="opened_side_valid"),
        CheckConstraint("status IN ('open', 'resolved')", name="status_valid"),
        CheckConstraint(
            "resolution IS NULL OR resolution IN ('resume', 'complete', 'cancel')",
            name="resolution_valid",
        ),
        CheckConstraint("(status = 'open') = (resolved_at IS NULL)", name="resolved_consistent"),
        CheckConstraint(
            "status = 'open' OR (resolution IS NOT NULL AND decision_reason IS NOT NULL "
            "AND resolved_by_id IS NOT NULL)",
            name="decision_recorded",
        ),
        Index(
            "uq_order_disputes_open_order",
            "order_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    opened_side: Mapped[str] = mapped_column(String(20))
    opened_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reason: Mapped[str] = mapped_column(Text)
    # سند اختیاری (عکس قطعه‌ی معیوب، صورت‌جلسه و…)
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="RESTRICT"), nullable=True
    )
    # وضعیت سفارش پیش از اختلاف؛ تصمیم «ادامه» سفارش را به همین وضعیت برمی‌گرداند
    previous_status: Mapped[str] = mapped_column(String(30))
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    resolution: Mapped[str | None] = mapped_column(String(20), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
