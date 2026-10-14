"""مسیرهای RFQ: درخواست‌های سازمان من، فید قطعه‌سازها، ثبت، جزئیات، لغو، تغییر مهلت و NDA."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import RFQ_CREATOR_ROLES, Capability
from app.db.session import get_db
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.identity.deps import CurrentUser, client_info, get_current_user, require_roles
from app.modules.rfqs import service
from app.modules.rfqs.schemas import (
    CancelRfqInput,
    CreateRfqInput,
    RescheduleRfqInput,
    RfqOut,
    RfqPage,
)

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


@router.get("/open", response_model=RfqPage)
async def list_open_rfqs(
    q: str | None = Query(default=None, max_length=100),
    capability: Capability | None = Query(default=None),
    city: str | None = Query(default=None, max_length=100),
    sort: service.FeedSort = Query(default="newest"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    user: CurrentUser = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
) -> RfqPage:
    items, total = await service.list_open_rfqs(
        db,
        user,
        q=q,
        capability=capability,
        city=city,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return RfqPage(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=RfqOut, status_code=201)
async def create_rfq(
    payload: CreateRfqInput,
    request: Request,
    user: CurrentUser = Depends(require_roles(*RFQ_CREATOR_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.create_rfq(db, user, payload, client_info(request))


@router.get("/{rfq_id}", response_model=RfqOut)
async def get_rfq(
    rfq_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.get_rfq(db, user, rfq_id)


@router.post("/{rfq_id}/cancel", response_model=RfqOut)
async def cancel_rfq(
    rfq_id: uuid.UUID,
    payload: CancelRfqInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.cancel_rfq(db, user, rfq_id, payload)


@router.post("/{rfq_id}/reschedule", response_model=RfqOut)
async def reschedule_rfq(
    rfq_id: uuid.UUID,
    payload: RescheduleRfqInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.reschedule_rfq(db, user, rfq_id, payload)


@router.post("/{rfq_id}/nda", response_model=RfqOut)
async def accept_nda(
    rfq_id: uuid.UUID,
    payload: AcceptedAgreementIn,
    request: Request,
    user: CurrentUser = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
) -> RfqOut:
    return await service.accept_nda(db, user, rfq_id, payload, client_info(request))
