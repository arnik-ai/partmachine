"""اعلان‌های داخل سایت کاربر جاری: فهرست، شمارنده‌ی خوانده‌نشده‌ها و علامت «خوانده شد»."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationOut, NotificationPage, UnreadCountOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
async def list_notifications(
    unread: bool = Query(default=False, description="فقط خوانده‌نشده‌ها"),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPage:
    return await service.list_notifications(
        db, user, unread_only=unread, limit=limit, offset=offset
    )


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountOut:
    return UnreadCountOut(unread=await service.unread_count(db, user))


@router.post("/read-all", response_model=UnreadCountOut)
async def mark_all_read(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountOut:
    return await service.mark_all_read(db, user)


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationOut:
    return await service.mark_read(db, user, notification_id)
