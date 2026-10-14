"""صف اختلاف‌ها در پنل ادمین؛ برای بقیه‌ی کاربران وجود ندارد (404)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.admin.router import require_admin
from app.modules.disputes import service
from app.modules.disputes.schemas import (
    AdminDisputeOut,
    AdminDisputePage,
    DisputeStatus,
    ResolveDisputeInput,
)
from app.modules.identity.deps import CurrentUser

router = APIRouter(prefix="/admin/disputes", tags=["admin"])


@router.get("", response_model=AdminDisputePage)
async def list_disputes(
    status: DisputeStatus | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDisputePage:
    return await service.list_disputes(db, status=status, limit=limit, offset=offset)


@router.post("/{dispute_id}/resolve", response_model=AdminDisputeOut)
async def resolve_dispute(
    dispute_id: uuid.UUID,
    payload: ResolveDisputeInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDisputeOut:
    """تصمیم با دلیل: ادامه‌ی سفارش، تکمیل یا لغو."""
    return await service.resolve(db, admin, dispute_id, payload)
