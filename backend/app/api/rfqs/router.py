"""مسیرهای RFQ: لیست درخواست‌های من، ثبت درخواست، جزئیات."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.api.rfqs.schemas import CreateRfqInput, RfqOut
from app.db.session import get_db
from app.models import Rfq, User

router = APIRouter(prefix="/rfqs", tags=["rfqs"])


def _to_out(rfq: Rfq) -> RfqOut:
    return RfqOut(
        id=rfq.id,
        title=rfq.title,
        description=rfq.description,
        capability=rfq.capability,
        material=rfq.material,
        quantity=rfq.quantity,
        delivery_city=rfq.delivery_city,
        deadline=rfq.deadline,
        status=rfq.status,
        files=rfq.files or [],
        quotations_count=len(rfq.quotations),
        created_at=rfq.created_at.isoformat(),
    )


@router.get("/mine", response_model=list[RfqOut])
async def list_my_rfqs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rfqs = list(
        await db.scalars(
            select(Rfq).where(Rfq.buyer_id == user.id).order_by(Rfq.created_at.desc())
        )
    )
    return [_to_out(r) for r in rfqs]


@router.post("", response_model=RfqOut, status_code=status.HTTP_201_CREATED)
async def create_rfq(
    payload: CreateRfqInput,
    user: User = Depends(require_roles("buyer", "agent")),
    db: AsyncSession = Depends(get_db),
):
    rfq = Rfq(
        buyer_id=user.id,
        title=payload.title,
        description=payload.description,
        capability=payload.capability,
        material=payload.material,
        quantity=payload.quantity,
        delivery_city=payload.delivery_city,
        deadline=payload.deadline,
        status="published",
        files=[f.model_dump(by_alias=True) for f in payload.files],
    )
    db.add(rfq)
    await db.commit()
    await db.refresh(rfq)
    return _to_out(rfq)


@router.get("/{rfq_id}", response_model=RfqOut)
async def get_rfq(rfq_id: str, db: AsyncSession = Depends(get_db)):
    rfq = await db.get(Rfq, rfq_id)
    if rfq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="درخواست یافت نشد"
        )
    return _to_out(rfq)
