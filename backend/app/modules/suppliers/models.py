import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.text import search_text_sql
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey

# متن جستجوی یکسان‌شده (حروف کوچک، ی/ک فارسی، نیم‌فاصله ← فاصله)؛ تست test_suppliers هم‌خوانی را بررسی می‌کند
SEARCH_TEXT_SQL = search_text_sql("company_name || ' ' || description")


class Supplier(Base, UUIDPrimaryKey, TimestampMixin):
    """پروفایل عمومی قطعه‌ساز؛ هر سازمان حداکثر یک پروفایل دارد."""

    __tablename__ = "suppliers"
    __table_args__ = (
        CheckConstraint("on_time_delivery_rate BETWEEN 0 AND 1", name="on_time_rate_range"),
        CheckConstraint("quality_score BETWEEN 0 AND 100", name="quality_range"),
        CheckConstraint("satisfaction_score BETWEEN 0 AND 100", name="satisfaction_range"),
        CheckConstraint("dispute_count >= 0", name="disputes_non_negative"),
        CheckConstraint("completed_jobs >= 0", name="jobs_non_negative"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), unique=True
    )
    company_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    city: Mapped[str] = mapped_column(String(100), default="", server_default="", index=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    founded_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    production_capacity_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=14, server_default="14")
    completed_jobs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    on_time_delivery_rate: Mapped[float] = mapped_column(Float, default=0.9, server_default="0.9")
    response_time_hours: Mapped[float] = mapped_column(Float, default=6, server_default="6")
    # نشان «تأییدشده» فقط با تأیید ادمین روی مدارک (verification_requests) روشن می‌شود
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    capabilities: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    machines: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    certifications: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    # قدیمی (عنوان‌های placeholder فاز ۱)؛ تصاویر واقعی فایل‌های portfolio_image سازمان‌اند
    gallery_titles: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )

    # ورودی‌های خام موتور Trust Score (امتیاز در زمان پاسخ محاسبه می‌شود)
    quality_score: Mapped[float] = mapped_column(Float, default=85, server_default="85")
    satisfaction_score: Mapped[float] = mapped_column(Float, default=85, server_default="85")
    dispute_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    search_text: Mapped[str] = mapped_column(Text, Computed(SEARCH_TEXT_SQL, persisted=True))
