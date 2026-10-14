"""آمار داشبورد کاربر جاری (از داده‌ی واقعی)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardOut
from app.modules.identity.deps import CurrentUser, get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
async def get_dashboard(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardOut:
    return await service.get_dashboard(db, user)
