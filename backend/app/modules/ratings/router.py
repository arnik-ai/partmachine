"""امتیاز کارفرما به قطعه‌ساز پس از تکمیل سفارش."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user
from app.modules.orders.schemas import OrderDetailOut
from app.modules.ratings import service
from app.modules.ratings.schemas import RatingInput

router = APIRouter(prefix="/orders", tags=["orders"])


@router.put("/{order_id}/rating", response_model=OrderDetailOut)
async def rate_order(
    order_id: uuid.UUID,
    payload: RatingInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    """ثبت یا تغییر امتیاز ۱ تا ۵ (فقط کارفرما، پس از تکمیل سفارش)."""
    return await service.rate_order(db, user, order_id, payload)
