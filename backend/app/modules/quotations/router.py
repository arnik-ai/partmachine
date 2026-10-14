"""مسیرهای پیشنهاد قیمت: فهرست (با محرمانگی)، ثبت، انتخاب برنده."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user, require_roles
from app.modules.quotations import service
from app.modules.quotations.schemas import CreateQuotationInput, QuotationOut

router = APIRouter(tags=["quotations"])


@router.get("/rfqs/{rfq_id}/quotations", response_model=list[QuotationOut])
async def list_quotations(
    rfq_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuotationOut]:
    return await service.list_for_rfq(db, user, rfq_id)


@router.post("/rfqs/{rfq_id}/quotations", response_model=QuotationOut, status_code=201)
async def create_quotation(
    rfq_id: uuid.UUID,
    payload: CreateQuotationInput,
    user: CurrentUser = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
) -> QuotationOut:
    return await service.submit(db, user, rfq_id, payload)


@router.post("/quotations/{quotation_id}/award", response_model=QuotationOut)
async def award_quotation(
    quotation_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuotationOut:
    return await service.award(db, user, quotation_id)
