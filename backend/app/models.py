"""
همه‌ی مدل‌های ORM در یک ماژول — برای ثبت یکجا در metadata و سادگی import.
ساختار هم‌راستا با ERD سند معماری.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class User(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    supplier: Mapped[Supplier | None] = relationship(
        back_populates="owner", cascade="all, delete-orphan", uselist=False
    )
    rfqs: Mapped[list[Rfq]] = relationship(
        back_populates="buyer", cascade="all, delete-orphan"
    )


class RefreshToken(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(512), unique=True, index=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column()

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class Supplier(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "suppliers"

    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    city: Mapped[str] = mapped_column(String(100), index=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    founded_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    production_capacity_per_month: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    lead_time_days: Mapped[int] = mapped_column(Integer, default=14)
    completed_jobs: Mapped[int] = mapped_column(Integer, default=0)
    on_time_delivery_rate: Mapped[float] = mapped_column(Float, default=0.9)
    response_time_hours: Mapped[float] = mapped_column(Float, default=6)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # فیلدهای جزئیات به‌صورت JSON ذخیره می‌شوند (لیست رشته/شیء)
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    machines: Mapped[list] = mapped_column(JSON, default=list)
    certifications: Mapped[list] = mapped_column(JSON, default=list)
    gallery_titles: Mapped[list] = mapped_column(JSON, default=list)

    # ورودی‌های خام موتور Trust Score
    quality_score: Mapped[float] = mapped_column(Float, default=85)
    satisfaction_score: Mapped[float] = mapped_column(Float, default=85)
    dispute_count: Mapped[int] = mapped_column(Integer, default=0)

    owner: Mapped[User | None] = relationship(back_populates="supplier")
    quotations: Mapped[list[Quotation]] = relationship(
        back_populates="supplier", cascade="all, delete-orphan"
    )


class Rfq(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "rfqs"

    buyer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    capability: Mapped[str] = mapped_column(String(50), index=True)
    material: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer)
    delivery_city: Mapped[str] = mapped_column(String(100))
    deadline: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="published", index=True)
    files: Mapped[list] = mapped_column(default=list)

    buyer: Mapped[User] = relationship(back_populates="rfqs")
    quotations: Mapped[list[Quotation]] = relationship(
        back_populates="rfq", cascade="all, delete-orphan"
    )


class Quotation(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "quotations"

    rfq_id: Mapped[str] = mapped_column(
        ForeignKey("rfqs.id", ondelete="CASCADE"), index=True
    )
    supplier_id: Mapped[str] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    total_price_rials: Mapped[int] = mapped_column(Integer)
    lead_time_days: Mapped[int] = mapped_column(Integer)
    valid_until: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_awarded: Mapped[bool] = mapped_column(Boolean, default=False)

    rfq: Mapped[Rfq] = relationship(back_populates="quotations")
    supplier: Mapped[Supplier] = relationship(back_populates="quotations")
