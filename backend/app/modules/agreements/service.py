"""اعتبارسنجی و ثبت پذیرش توافق‌ها."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, field_error
from app.modules.agreements.catalog import AGREEMENTS, INSPECTION_NDA, RFQ_NDA, Agreement
from app.modules.agreements.models import AgreementAcceptance
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.identity.deps import ClientInfo

FIELD = "acceptedAgreements"

# NDAهایی که برای هر سازمان و RFQ یک‌بار ثبت می‌شوند، با شرط همان ایندکس یکتای جزئی‌شان
# (ON CONFLICT باید دقیقاً همان شرط را بدهد تا ایندکس پیدا شود)
_NDA_INDEX_WHERE = {
    RFQ_NDA.key: text("document = 'rfq_nda'"),
    INSPECTION_NDA.key: text("document = 'inspection_nda'"),
}


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


async def record_rfq_nda(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    rfq_id: uuid.UUID,
    client: ClientInfo | None,
    agreement: Agreement = RFQ_NDA,
) -> bool:
    """پذیرش NDA یک RFQ (یا NDA آزمایشگاهِ سفارش همان RFQ) برای سازمان؛ اگر هم‌زمان ثبت شده
    باشد کاری نمی‌کند و False برمی‌گرداند.

    با ON CONFLICT DO NOTHING خطای تکراری اصلاً رخ نمی‌دهد و تراکنش و اتصال سالم می‌مانند
    (ادامه‌ی کار پس از IntegrityError و rollback در asyncpg گاهی به خطای اتصال می‌خورد).
    """
    result = await db.execute(
        insert(AgreementAcceptance)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            organization_id=organization_id,
            document=agreement.key,
            version=agreement.version,
            rfq_id=rfq_id,
            ip=client.ip if client else None,
            user_agent=client.user_agent if client else None,
        )
        .on_conflict_do_nothing(
            index_elements=["organization_id", "rfq_id"],
            index_where=_NDA_INDEX_WHERE[agreement.key],
        )
    )
    return bool(result.rowcount)  # type: ignore[attr-defined]


async def has_accepted_rfq_nda(
    db: AsyncSession,
    organization_id: uuid.UUID,
    rfq_id: uuid.UUID,
    *,
    agreement: Agreement = RFQ_NDA,
) -> bool:
    found = await db.scalar(
        select(AgreementAcceptance.id).where(
            AgreementAcceptance.organization_id == organization_id,
            AgreementAcceptance.document == agreement.key,
            AgreementAcceptance.rfq_id == rfq_id,
        )
    )
    return found is not None
