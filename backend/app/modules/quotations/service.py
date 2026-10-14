"""پیشنهاد قیمت و انتخاب برنده.

محرمانگی: صاحب RFQ همه‌ی پیشنهادها را می‌بیند؛ هر قطعه‌ساز فقط پیشنهاد خودش را.
یکپارچگی: ثبت پیشنهاد و انتخاب برنده روی ردیف RFQ قفل (SELECT ... FOR UPDATE) می‌گیرند
و قیدهای پایگاه داده (یک پیشنهاد برای هر قطعه‌ساز، یک برنده برای هر RFQ) پشتوانه‌ی آن‌اند.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.time import business_today
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.quotations.models import Quotation
from app.modules.quotations.schemas import CreateQuotationInput, QuotationOut
from app.modules.rfqs import service as rfq_service
from app.modules.rfqs.models import OPEN_STATUSES, Rfq
from app.modules.rfqs.policies import RfqView, can_award
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.service import supplier_for_organization, trust_score

QUOTATION_NOT_FOUND = "پیشنهاد موردنظر پیدا نشد."
DUPLICATE_QUOTE = "شما قبلاً برای این درخواست قیمت داده‌اید."


def to_out(quotation: Quotation, supplier: Supplier, rfq: Rfq) -> QuotationOut:
    return QuotationOut(
        id=quotation.id,
        rfq_id=quotation.rfq_id,
        supplier_id=quotation.supplier_id,
        supplier_name=supplier.company_name,
        supplier_city=supplier.city,
        supplier_score=trust_score(supplier)["trust"],
        verified=supplier.verified,
        total_price_rials=quotation.total_price_rials,
        lead_time_days=quotation.lead_time_days,
        valid_until=quotation.valid_until,
        note=quotation.note,
        submitted_at=quotation.created_at,
        is_awarded=rfq.awarded_quotation_id == quotation.id,
    )


async def list_for_rfq(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID
) -> list[QuotationOut]:
    rfq, view = await rfq_service.load_visible(db, user, rfq_id)
    stmt = (
        select(Quotation, Supplier)
        .join(Supplier, Supplier.id == Quotation.supplier_id)
        .where(Quotation.rfq_id == rfq.id)
        .order_by(Quotation.total_price_rials, Quotation.created_at)
    )
    if view is not RfqView.FULL:
        # قطعه‌ساز فقط پیشنهاد خودش را می‌بیند — هرگز قیمت رقبا
        own = await supplier_for_organization(db, user.organization_id)
        if own is None:
            return []
        stmt = stmt.where(Quotation.supplier_id == own.id)
    rows = await db.execute(stmt)
    return [to_out(q, s, rfq) for q, s in rows.all()]


async def submit(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, data: CreateQuotationInput
) -> QuotationOut:
    supplier = await supplier_for_organization(db, user.organization_id)
    if supplier is None:
        raise Conflict("ابتدا پروفایل قطعه‌ساز خود را کامل کنید.", code="supplier_profile_missing")

    # قفل ردیف RFQ تا ثبت پیشنهاد و انتخاب برنده هم‌زمان اجرا نشوند. اینجا عمداً load_visible
    # استفاده نمی‌شود: همه‌ی قطعه‌سازها RFQهای باز را می‌بینند، و قطعه‌سازی که صفحه‌ی RFQ را باز
    # داشته باید بعد از بسته شدن آن پیام روشن «دیگر پیشنهاد نمی‌پذیرد» ببیند، نه «پیدا نشد».
    rfq = await db.scalar(select(Rfq).where(Rfq.id == rfq_id).with_for_update())
    if rfq is None:
        raise NotFound(rfq_service.RFQ_NOT_FOUND)
    if rfq.organization_id == user.organization_id:
        raise Conflict("نمی‌توانید برای درخواست خودتان قیمت بدهید.", code="own_rfq")
    if rfq.status not in OPEN_STATUSES:
        raise Conflict("این درخواست دیگر پیشنهاد جدید نمی‌پذیرد.", code="rfq_closed")
    if rfq.deadline < business_today():
        raise Conflict("مهلت ارسال پیشنهاد برای این درخواست تمام شده است.", code="rfq_expired")

    existing = await db.scalar(
        select(Quotation.id).where(Quotation.rfq_id == rfq.id, Quotation.supplier_id == supplier.id)
    )
    if existing is not None:
        raise Conflict(DUPLICATE_QUOTE, code="duplicate_quotation")

    quotation = Quotation(
        id=uuid.uuid4(),
        rfq_id=rfq.id,
        supplier_id=supplier.id,
        submitted_by_id=user.id,
        total_price_rials=data.total_price_rials,
        lead_time_days=data.lead_time_days,
        valid_until=data.valid_until,
        note=data.note,
    )
    db.add(quotation)
    if rfq.status == "published":
        rfq.status = "quoting"
    audit.record(
        db,
        action="quotation.submitted",
        entity_type="quotation",
        entity_id=quotation.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"rfq_id": str(rfq.id)},
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise Conflict(DUPLICATE_QUOTE, code="duplicate_quotation") from None
    return to_out(quotation, supplier, rfq)


async def award(db: AsyncSession, user: CurrentUser, quotation_id: uuid.UUID) -> QuotationOut:
    quotation = await db.get(Quotation, quotation_id)
    if quotation is None:
        raise NotFound(QUOTATION_NOT_FOUND)
    # قفل ردیف RFQ: درخواست‌های هم‌زمان پشت سر هم اجرا می‌شوند
    rfq = await db.scalar(select(Rfq).where(Rfq.id == quotation.rfq_id).with_for_update())
    if rfq is None or not can_award(rfq, user):
        raise NotFound(QUOTATION_NOT_FOUND)
    supplier = await db.get(Supplier, quotation.supplier_id)
    assert supplier is not None

    if rfq.awarded_quotation_id == quotation.id:
        return to_out(quotation, supplier, rfq)  # تکرار همان درخواست: بی‌اثر و موفق
    if rfq.awarded_quotation_id is not None:
        raise Conflict("برای این درخواست قبلاً برنده انتخاب شده است.", code="already_awarded")
    if rfq.status not in OPEN_STATUSES:
        raise Conflict("این درخواست بسته شده است و برنده‌ای نمی‌توان انتخاب کرد.", code="rfq_closed")
    if quotation.valid_until < business_today():
        raise Conflict("اعتبار این پیشنهاد به پایان رسیده است.", code="quotation_expired")

    rfq.awarded_quotation_id = quotation.id
    rfq.status = "awarded"
    audit.record(
        db,
        action="rfq.awarded",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"quotation_id": str(quotation.id), "supplier_id": str(supplier.id)},
    )
    await db.commit()
    return to_out(quotation, supplier, rfq)
