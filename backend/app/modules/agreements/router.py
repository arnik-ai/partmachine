"""متن توافق‌ها — عمومی (فرم ثبت‌نام پیش از ورود هم به آن نیاز دارد)."""

from fastapi import APIRouter, Path

from app.modules.agreements import service
from app.modules.agreements.schemas import AgreementItemOut, AgreementOut

router = APIRouter(prefix="/agreements", tags=["agreements"])


@router.get("/{key}", response_model=AgreementOut)
async def get_agreement(key: str = Path(max_length=40)) -> AgreementOut:
    agreement = service.get_agreement(key)
    return AgreementOut(
        key=agreement.key,
        title=agreement.title,
        version=agreement.version,
        items=[
            AgreementItemOut(id=item.id, text=item.text, critical=item.critical)
            for item in agreement.items
        ],
    )
