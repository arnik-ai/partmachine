"""تأیید هویت از سمت قطعه‌ساز: دیدن وضعیت آخرین درخواست و ارسال مدارک."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, require_roles
from app.modules.verification import service
from app.modules.verification.schemas import SubmitVerificationInput, VerificationOut

router = APIRouter(prefix="/suppliers/me/verification", tags=["verification"])


@router.get("", response_model=VerificationOut | None)
async def latest_verification(
    user: CurrentUser = Depends(require_roles("supplier")), db: AsyncSession = Depends(get_db)
) -> VerificationOut | None:
    """آخرین درخواست سازمان؛ اگر هنوز درخواستی نفرستاده باشد `null`."""
    return await service.latest(db, user)


@router.post("", response_model=VerificationOut, status_code=201)
async def submit_verification(
    payload: SubmitVerificationInput,
    user: CurrentUser = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
) -> VerificationOut:
    return await service.submit(db, user, payload)
