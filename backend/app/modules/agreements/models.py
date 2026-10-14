import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base, UUIDPrimaryKey


class AgreementAcceptance(Base, UUIDPrimaryKey):
    """شاهد پذیرش یک نسخه‌ی مشخص از یک متن توافق (فقط افزودنی؛ هرگز ویرایش نمی‌شود)."""

    __tablename__ = "agreement_acceptances"
    __table_args__ = (
        Index("ix_agreement_acceptances_user", "user_id"),
        Index("ix_agreement_acceptances_org_document", "organization_id", "document"),
        # NDA هر RFQ برای هر سازمان یک‌بار پذیرفته می‌شود (حتی با درخواست هم‌زمان)
        Index(
            "uq_agreement_acceptances_rfq_nda",
            "organization_id",
            "rfq_id",
            unique=True,
            postgresql_where=text("document = 'rfq_nda'"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    document: Mapped[str] = mapped_column(String(40))
    version: Mapped[str] = mapped_column(String(20))
    rfq_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rfqs.id", ondelete="RESTRICT"), nullable=True
    )
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
