"""کنترل کیفیت سفارش: فهرست آزمایشگاه‌های تأییدشده، انتخاب یا حذف آزمایشگاه (کارفرما)، اعلام
آمادگی (قطعه‌ساز)، پذیرش تعهد عدم افشا و ثبت نتیجه (آزمایشگاه)."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import RFQ_CREATOR_ROLES
from app.db.session import get_db
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.identity.deps import CurrentUser, client_info, get_current_user, require_roles
from app.modules.inspections import service
from app.modules.inspections.schemas import (
    ChooseLabInput,
    InspectionOut,
    InspectionResultInput,
    MarkReadyInput,
    QcLabList,
)

router = APIRouter(tags=["inspections"])
INSPECTION = "/orders/{order_id}/inspection"


@router.get("/qc-labs", response_model=QcLabList)
async def list_labs(
    _: CurrentUser = Depends(require_roles(*RFQ_CREATOR_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> QcLabList:
    """آزمایشگاه‌هایی که پارت‌ماشین تأیید کرده است (برای انتخاب کارفرما)."""
    return await service.list_labs(db)


@router.get(INSPECTION, response_model=InspectionOut)
async def get_inspection(
    order_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    return await service.get_inspection(db, user, order_id)


@router.put(INSPECTION, response_model=InspectionOut)
async def choose_lab(
    order_id: uuid.UUID,
    payload: ChooseLabInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    """انتخاب یا تغییر آزمایشگاه پیش از ارسال (کارفرما)."""
    return await service.choose_lab(db, user, order_id, payload)


@router.delete(INSPECTION, response_model=InspectionOut)
async def remove_inspection(
    order_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    return await service.remove(db, user, order_id)


@router.post(f"{INSPECTION}/ready", response_model=InspectionOut)
async def mark_ready(
    order_id: uuid.UUID,
    payload: MarkReadyInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    """قطعه‌ساز: سفارش آماده‌ی بازرسی است (هر اعلام یک دور تازه)."""
    return await service.mark_ready(db, user, order_id, payload)


@router.post(f"{INSPECTION}/nda", response_model=InspectionOut)
async def accept_nda(
    order_id: uuid.UUID,
    payload: AcceptedAgreementIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    return await service.accept_nda(db, user, order_id, payload, client_info(request))


@router.post(f"{INSPECTION}/result", response_model=InspectionOut)
async def record_result(
    order_id: uuid.UUID,
    payload: InspectionResultInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InspectionOut:
    """آزمایشگاه: قبول یا رد، با گزارش بازرسی (و دلیل، در صورت رد)."""
    return await service.record_result(db, user, order_id, payload)
