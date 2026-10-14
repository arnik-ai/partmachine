import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class Organization(Base, UUIDPrimaryKey, TimestampMixin):
    """مستاجر (tenant): هر داده‌ی خصوصی به یک سازمان تعلق دارد.

    سازنده‌ی سازمان (هنگام ثبت‌نام) «مدیر» آن است و می‌تواند با لینک دعوت عضو اضافه کند.
    هر کاربر فقط عضو یک سازمان است.
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200))


class OrganizationInvite(Base, UUIDPrimaryKey):
    """لینک دعوت یک‌بارمصرف. فقط هش توکن ذخیره می‌شود؛ خود لینک یک‌بار به مدیر نشان داده می‌شود."""

    __tablename__ = "organization_invites"
    __table_args__ = (
        CheckConstraint(
            "user_role IN ('buyer', 'supplier', 'agent', 'qc')", name="user_role_valid"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # نقش کاری عضو جدید؛ همان نقش مدیر سازمان (مثلاً قطعه‌ساز)
    user_role: Mapped[str] = mapped_column(String(20))
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def is_usable(self, now: datetime) -> bool:
        return self.accepted_at is None and self.revoked_at is None and self.expires_at > now
