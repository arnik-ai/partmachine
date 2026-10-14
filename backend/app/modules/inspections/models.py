import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class OrderInspection(Base, UUIDPrimaryKey):
    """بازرسی کیفیت اختیاری یک سفارش (O9): آزمایشگاه تأییدشده‌ای که کارفرما انتخاب کرده است.

    قطعه‌ساز «آماده‌ی بازرسی» را اعلام می‌کند (هر اعلام یک دور تازه است) و آزمایشگاه نتیجه‌ی
    همان دور را با گزارش ثبت می‌کند. رد ⇒ قطعه‌ساز اصلاح می‌کند و دوباره اعلام می‌کند؛ تا
    قبولی، ارسال ممکن نیست. ردیف فقط وضعیت فعلی و آخرین نتیجه را نگه می‌دارد؛ تاریخچه‌ی همه‌ی
    دورها در order_events است.

    چرخه: requested ← ready ← passed | failed؛ failed ← ready (دور بعد).
    """

    __tablename__ = "order_inspections"
    __table_args__ = (
        CheckConstraint(
            "status IN ('requested', 'ready', 'passed', 'failed')", name="status_valid"
        ),
        CheckConstraint("attempt >= 0", name="attempt_non_negative"),
        CheckConstraint("(status = 'requested') = (attempt = 0)", name="attempt_consistent"),
        CheckConstraint("(status = 'requested') = (ready_at IS NULL)", name="ready_consistent"),
        CheckConstraint(
            "status NOT IN ('passed', 'failed') "
            "OR (result_at IS NOT NULL AND report_file_id IS NOT NULL)",
            name="result_recorded",
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True
    )
    lab_organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="requested", server_default="requested")
    # شماره‌ی دور فعلی: چندبار قطعه‌ساز سفارش را آماده‌ی بازرسی اعلام کرده است
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    requested_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # آخرین نتیجه؛ پس از رد تا نتیجه‌ی دور بعد می‌ماند تا قطعه‌ساز دلیل رد را ببیند
    result_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    result_note: Mapped[str] = mapped_column(Text, default="", server_default="")
    report_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="RESTRICT"), nullable=True
    )
