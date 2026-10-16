"""مسیرهای سفارش. فقط دو سازمان طرف سفارش (و ادمین) آن را می‌بینند؛ بقیه 404."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user
from app.modules.orders import service
from app.modules.orders.schemas import (
    CancelOrderInput,
    ConfirmDeliveryInput,
    ConfirmMaterialInput,
    KeepOrderInput,
    OpenDisputeInput,
    OrderDetailOut,
    OrderPage,
    ShipOrderInput,
    StatusGroup,
)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=OrderPage)
async def list_orders(
    status: StatusGroup = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderPage:
    items, total = await service.list_orders(db, user, group=status, limit=limit, offset=offset)
    return OrderPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{order_id}", response_model=OrderDetailOut)
async def get_order(
    order_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    return await service.get_order(db, user, order_id)


@router.post("/{order_id}/cancel", response_model=OrderDetailOut)
async def cancel_order(
    order_id: uuid.UUID,
    payload: CancelOrderInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    """پیش از امضای قرارداد: لغو با ذکر دلیل. پس از امضا (O11): بار اول «درخواست لغو» یک طرف
    است و همین درخواست از طرف دیگر یعنی موافقت، و سفارش لغو می‌شود."""
    return await service.transition(db, user, order_id, "cancel", reason=payload.reason)


@router.post("/{order_id}/keep", response_model=OrderDetailOut)
async def keep_order(
    order_id: uuid.UUID,
    payload: KeepOrderInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    """ادامه‌ی سفارش: پس گرفتن درخواست لغو خود، یا نپذیرفتن درخواست لغو طرف مقابل."""
    return await service.keep_order(db, user, order_id, payload.note)


@router.post("/{order_id}/dispute", response_model=OrderDetailOut)
async def open_dispute(
    order_id: uuid.UUID,
    payload: OpenDisputeInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    """«اعلام مشکل»: سفارش تا تصمیم پشتیبانی متوقف می‌شود (O11)."""
    return await service.transition(
        db, user, order_id, "dispute", note=payload.reason, file_id=payload.file_id
    )


@router.post("/{order_id}/ship", response_model=OrderDetailOut)
async def ship_order(
    order_id: uuid.UUID,
    payload: ShipOrderInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    return await service.transition(
        db, user, order_id, "ship", note=payload.note, file_id=payload.file_id
    )


@router.post("/{order_id}/confirm-material", response_model=OrderDetailOut)
async def confirm_material(
    order_id: uuid.UUID,
    payload: ConfirmMaterialInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    """مجری رسیدن قطعه یا مواد کارفرما را اعلام می‌کند؛ مهلت تحویل از امروز شمرده می‌شود."""
    return await service.transition(db, user, order_id, "confirm_material", note=payload.note)


@router.post("/{order_id}/confirm-delivery", response_model=OrderDetailOut)
async def confirm_delivery(
    order_id: uuid.UUID,
    payload: ConfirmDeliveryInput,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailOut:
    return await service.transition(db, user, order_id, "confirm_delivery", note=payload.note)
