"""مسیرهای RFQ: درخواست‌های سازمان من، ثبت درخواست، جزئیات (با قواعد دسترسی)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import RFQ_CREATOR_ROLES
from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user, require_roles
from app.modules.rfqs import service
from app.modules.rfqs.schemas import CreateRfqInput, RfqOut, RfqPage

router = APIRouter(prefix="/rfqs", tags=["rfqs"])


@router.get("/mine", response_model=RfqPage)
async def list_my_rfqs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqPage:
    items, total = await service.list_organization_rfqs(db, user, limit=limit, offset=offset)
    return RfqPage(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=RfqOut, status_code=201)
async def create_rfq(
    payload: CreateRfqInput,
    user: CurrentUser = Depends(require_roles(*RFQ_CREATOR_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.create_rfq(db, user, payload)


@router.get("/{rfq_id}", response_model=RfqOut)
async def get_rfq(
    rfq_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.get_rfq(db, user, rfq_id)
