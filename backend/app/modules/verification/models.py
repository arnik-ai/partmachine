import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class VerificationRequest(Base, UUIDPrimaryKey):
    """درخواست تأیید هویت قطعه‌ساز: مدارک بارگذاری‌شده + تصمیم دستی ادمین (P4).

    چرخه: pending ← approved یا rejected؛ approved ← revoked (لغو تأیید، مثلاً پس از تخلف).
    هر سازمان در هر لحظه حداکثر یک درخواست در انتظار دارد. مدارک با
    `files.verification_request_id` به درخواست وصل می‌شوند و دیگر حذف‌شدنی نیستند.
    """

    __tablename__ = "verification_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'revoked')", name="status_valid"
        ),
        CheckConstraint("(status = 'pending') = (decided_at IS NULL)", name="decision_consistent"),
        CheckConstraint(
            "status <> 'rejected' OR decision_reason IS NOT NULL", name="rejection_has_reason"
        ),
        CheckConstraint(
            "(status = 'revoked') = (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)",
            name="revocation_consistent",
        ),
        Index(
            "uq_verification_requests_pending_org",
            "organization_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    submitted_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    # توضیح اختیاری قطعه‌ساز برای کارشناس
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )

    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    # برای قطعه‌ساز نمایش داده می‌شود (دلیل رد، یا توضیح تأیید)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    revoke_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
