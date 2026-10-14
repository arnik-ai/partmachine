"""اقساط سفارش: دیدن (دو طرف و ادمین)، اعلام پرداخت (کارفرما)، تأیید یا رد دریافت (قطعه‌ساز)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user
from app.modules.payments import service
from app.modules.payments.schemas import PaymentsOut, RejectPaymentInput, ReportPaymentInput

router = APIRouter(prefix="/orders/{order_id}/payments", tags=["payments"])


@router.get("", response_model=PaymentsOut)
async def list_payments(
    order_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentsOut:
    return await service.list_payments(db, user, order_id)


@router.post("/{payment_id}/report", response_model=PaymentsOut)
async def report_payment(
    order_id: uuid.UUID,
    payment_id: uuid.UUID,
    payload: ReportPaymentInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentsOut:
    """پرداختِ انجام‌شده بیرون از پلتفرم، با شماره‌ی پیگیری یا تصویر رسید."""
    return await service.report(db, user, order_id, payment_id, payload)


@router.post("/{payment_id}/confirm", response_model=PaymentsOut)
async def confirm_payment(
    order_id: uuid.UUID,
    payment_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentsOut:
    return await service.confirm(db, user, order_id, payment_id)


@router.post("/{payment_id}/reject", response_model=PaymentsOut)
async def reject_payment(
    order_id: uuid.UUID,
    payment_id: uuid.UUID,
    payload: RejectPaymentInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentsOut:
    return await service.reject(db, user, order_id, payment_id, payload)
