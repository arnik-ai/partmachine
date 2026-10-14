import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    false,
    func,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class User(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('buyer', 'supplier', 'agent', 'qc', 'admin')", name="role_valid"),
        # ایمیل همیشه با حروف کوچک ذخیره می‌شود تا دو حساب برای یک ایمیل ساخته نشود
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("org_role IN ('owner', 'member')", name="org_role_valid"),
        CheckConstraint("phone_verified_at IS NULL OR phone IS NOT NULL", name="phone_consistent"),
        # هر شماره‌ی تأییدشده فقط به یک حساب تعلق دارد
        Index("uq_users_phone", "phone", unique=True, postgresql_where=text("phone IS NOT NULL")),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    # نقش در سازمان: owner (سازنده؛ دعوت و حذف اعضا) یا member (عضو دعوت‌شده)
    org_role: Mapped[str] = mapped_column(String(20), default="owner", server_default="owner")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # نسخه‌ی نشست‌ها: با تغییر یا بازیابی رمز بالا می‌رود و توکن‌های دسترسی قبلی را باطل می‌کند
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # موبایل فقط پس از تأیید با کد یک‌بارمصرف ذخیره می‌شود (قالب +989xxxxxxxxx)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class RefreshToken(Base, UUIDPrimaryKey):
    """نشست مرورگر. فقط هش توکن ذخیره می‌شود؛ همه‌ی توکن‌های یک ورود یک `family_id` دارند
    تا استفاده‌ی مجدد از توکن باطل‌شده کل خانواده را باطل کند."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
