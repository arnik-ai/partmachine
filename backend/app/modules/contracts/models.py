import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class Contract(Base, UUIDPrimaryKey):
    """قرارداد هر سفارش (یکی برای هر سفارش). متن در نسخه‌ها نگه داشته می‌شود؛ نسخه‌ی جاری همان
    است که امضا می‌شود. پس از امضای هر دو طرف `signed_at` پر و قرارداد قفل می‌شود."""

    __tablename__ = "contracts"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True
    )
    current_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )


class ContractVersion(Base, UUIDPrimaryKey):
    """یک نسخه‌ی تغییرناپذیر: پارامترها، متن کامل مواد و هش آن. هر تغییر نسخه‌ی تازه می‌سازد."""

    __tablename__ = "contract_versions"
    __table_args__ = (
        UniqueConstraint("contract_id", "number", name="uq_contract_versions_contract_number"),
        CheckConstraint("number >= 1", name="number_positive"),
        CheckConstraint("prepayment_percent BETWEEN 0 AND 100", name="prepayment_percent_range"),
        CheckConstraint("penalty_per_day_bp BETWEEN 0 AND 1000", name="penalty_range"),
        CheckConstraint("penalty_cap_percent BETWEEN 0 AND 100", name="penalty_cap_range"),
    )

    contract_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contracts.id", ondelete="RESTRICT"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    # پارامترهایی که کارفرما پیش از امضا تنظیم می‌کند (O5)
    delivery_due: Mapped[date] = mapped_column(Date)
    prepayment_percent: Mapped[int] = mapped_column(Integer)
    # جریمه‌ی تأخیر روزانه به «صدم درصد» (۵۰ یعنی ۰٫۵٪) تا عدد اعشاری ذخیره نشود
    penalty_per_day_bp: Mapped[int] = mapped_column(Integer)
    penalty_cap_percent: Mapped[int] = mapped_column(Integer)
    # متن کامل مواد همان‌طور که نمایش و امضا می‌شود، و هش SHA-256 آن (شاهد)
    articles: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    template_version: Mapped[str] = mapped_column(String(20))
    content_sha256: Mapped[str] = mapped_column(String(64))
    change_note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )


class ContractSignature(Base, UUIDPrimaryKey):
    """شاهد امضا (O3): مدیر سازمان، با رمز عبور، روی همین نسخه و همین هش."""

    __tablename__ = "contract_signatures"
    __table_args__ = (
        UniqueConstraint("version_id", "side", name="uq_contract_signatures_version_side"),
        CheckConstraint("side IN ('buyer', 'supplier')", name="side_valid"),
    )

    version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contract_versions.id", ondelete="RESTRICT"), index=True
    )
    side: Mapped[str] = mapped_column(String(20))
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    content_sha256: Mapped[str] = mapped_column(String(64))
    ip: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(300))
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
