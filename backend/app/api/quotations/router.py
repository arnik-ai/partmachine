"""مسیرهای استعلام: فهرست استعلام‌های یک RFQ، ثبت استعلام، انتخاب برنده."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.api.quotations.schemas import CreateQuotationInput, QuotationOut
from app.db.session import get_db
from app.models import Quotation, Rfq, Supplier, User
from app.services.trust_score import compute_trust_score

router = APIRouter(tags=["quotations"])


def _to_out(q: Quotation) -> QuotationOut:
    supplier = q.supplier
    score = compute_trust_score(
        on_time_delivery_rate=supplier.on_time_delivery_rate,
        quality_score=supplier.quality_score,
        satisfaction_score=supplier.satisfaction_score,
        response_time_hours=supplier.response_time_hours,
        dispute_count=supplier.dispute_count,
        completed_jobs=supplier.completed_jobs,
    )
    return QuotationOut(
        id=q.id,
        rfq_id=q.rfq_id,
        supplier_id=q.supplier_id,
        supplier_name=supplier.company_name,
        supplier_city=supplier.city,
        supplier_score=score["trust"],
        verified=supplier.verified,
        total_price_rials=q.total_price_rials,
        lead_time_days=q.lead_time_days,
        valid_until=q.valid_until,
        note=q.note,
        submitted_at=q.created_at.isoformat(),
    )


@router.get("/rfqs/{rfq_id}/quotations", response_model=list[QuotationOut])
async def list_quotations(rfq_id: str, db: AsyncSession = Depends(get_db)):
    quotes = list(
        await db.scalars(select(Quotation).where(Quotation.rfq_id == rfq_id))
    )
    return [_to_out(q) for q in quotes]


@router.post(
    "/rfqs/{rfq_id}/quotations",
    response_model=QuotationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_quotation(
    rfq_id: str,
    payload: CreateQuotationInput,
    user: User = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
):
    rfq = await db.get(Rfq, rfq_id)
    if rfq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="درخواست یافت نشد"
        )

    supplier = await db.scalar(
        select(Supplier).where(Supplier.owner_id == user.id)
    )
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ابتدا پروفایل قطعه‌ساز خود را تکمیل کنید",
        )

    quote = Quotation(
        rfq_id=rfq_id,
        supplier_id=supplier.id,
        total_price_rials=payload.total_price_rials,
        lead_time_days=payload.lead_time_days,
        valid_until=payload.valid_until,
        note=payload.note,
    )
    db.add(quote)
    # وضعیت RFQ به «در حال دریافت استعلام» می‌رود
    if rfq.status == "published":
        rfq.status = "quoting"
    await db.commit()
    await db.refresh(quote)
    return _to_out(quote)


@router.post("/quotations/{quotation_id}/award", response_model=QuotationOut)
async def award_quotation(
    quotation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    quote = await db.get(Quotation, quotation_id)
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="استعلام یافت نشد"
        )

    rfq = await db.get(Rfq, quote.rfq_id)
    if rfq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="درخواست یافت نشد"
        )
    # فقط صاحب RFQ می‌تواند برنده را انتخاب کند
    if rfq.buyer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط صاحب درخواست می‌تواند برنده را انتخاب کند",
        )

    quote.is_awarded = True
    rfq.status = "awarded"
    await db.commit()
    await db.refresh(quote)
    return _to_out(quote)
