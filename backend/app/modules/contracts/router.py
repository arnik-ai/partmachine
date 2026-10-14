"""قرارداد هر سفارش: مشاهده (دو طرف و ادمین)، تنظیم پارامترها (کارفرما)، امضا (مدیر هر طرف با
رمز عبور) و درخواست اصلاح (قطعه‌ساز)."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.contracts import service
from app.modules.contracts.schemas import (
    ChangeRequestInput,
    ContractOut,
    SignContractInput,
    UpdateContractInput,
)
from app.modules.identity.deps import CurrentUser, client_info, get_current_user

router = APIRouter(prefix="/orders/{order_id}/contract", tags=["contracts"])


@router.get("", response_model=ContractOut)
async def get_contract(
    order_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractOut:
    return await service.get_contract(db, user, order_id)


@router.put("", response_model=ContractOut)
async def update_contract(
    order_id: uuid.UUID,
    payload: UpdateContractInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractOut:
    """نسخه‌ی تازه با پارامترهای جدید؛ امضاهای نسخه‌ی قبلی دیگر معتبر نیستند (O5)."""
    return await service.update_contract(db, user, order_id, payload)


@router.post("/sign", response_model=ContractOut)
async def sign_contract(
    order_id: uuid.UUID,
    payload: SignContractInput,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractOut:
    return await service.sign_contract(db, user, order_id, payload, client_info(request))


@router.post("/change-request", response_model=ContractOut)
async def request_change(
    order_id: uuid.UUID,
    payload: ChangeRequestInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractOut:
    return await service.request_change(db, user, order_id, payload)
