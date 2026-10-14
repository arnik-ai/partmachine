"""اعتبارسنجی و ثبت پذیرش توافق‌ها."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, field_error
from app.modules.agreements.catalog import AGREEMENTS, RFQ_NDA, Agreement
from app.modules.agreements.models import AgreementAcceptance
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.identity.deps import ClientInfo

FIELD = "acceptedAgreements"


def get_agreement(key: str) -> Agreement:
    agreement = AGREEMENTS.get(key)
    if agreement is None:
        raise NotFound("متن موردنظر پیدا نشد.")
    return agreement


def require_accepted(accepted: Sequence[AcceptedAgreementIn], key: str) -> Agreement:
    """بررسی می‌کند که نسخه‌ی جاری متن `key` پذیرفته شده باشد؛ وگرنه خطای 422 روی همان فیلد."""
    agreement = AGREEMENTS[key]
    match = next((a for a in accepted if a.key == key), None)
    if match is None:
        raise field_error(FIELD, "برای ادامه، قوانین را مطالعه کنید و همه‌ی بندها را بپذیرید.")
    if match.version != agreement.version:
        raise field_error(
            FIELD,
            "متن قوانین به‌روز شده است؛ صفحه را دوباره بارگذاری کنید و نسخه‌ی جدید را بپذیرید.",
        )
    return agreement


def record(
    db: AsyncSession,
    *,
    agreement: Agreement,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    client: ClientInfo | None,
    rfq_id: uuid.UUID | None = None,
) -> None:
    """پذیرش را در همان تراکنش عملیات اصلی ثبت می‌کند (commit با فراخواننده است)."""
    db.add(
        AgreementAcceptance(
            user_id=user_id,
            organization_id=organization_id,
            document=agreement.key,
            version=agreement.version,
            rfq_id=rfq_id,
            ip=client.ip if client else None,
            user_agent=client.user_agent if client else None,
        )
    )


async def has_accepted_rfq_nda(
    db: AsyncSession, organization_id: uuid.UUID, rfq_id: uuid.UUID
) -> bool:
    found = await db.scalar(
        select(AgreementAcceptance.id).where(
            AgreementAcceptance.organization_id == organization_id,
            AgreementAcceptance.document == RFQ_NDA.key,
            AgreementAcceptance.rfq_id == rfq_id,
        )
    )
    return found is not None
