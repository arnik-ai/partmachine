import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class OrderRating(Base, UUIDPrimaryKey):
    """امتیاز ۱ تا ۵ کارفرما به قطعه‌ساز پس از تکمیل سفارش (O12)؛ برای هر سفارش یکی.

    کارفرما می‌تواند امتیاز را تغییر دهد. توضیح فقط در صفحه‌ی همان سفارش برای دو طرف دیده
    می‌شود؛ پروفایل عمومی قطعه‌ساز فقط میانگین و تعداد امتیازها را نشان می‌دهد.
    """

    __tablename__ = "order_ratings"
    __table_args__ = (CheckConstraint("score BETWEEN 1 AND 5", name="score_range"),)

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    rated_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    score: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(String(500), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
