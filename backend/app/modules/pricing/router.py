"""برآورد قیمت — عمومی، بدون نیاز به ورود (ورودی‌ها محدود شده‌اند)."""

from fastapi import APIRouter

from app.modules.pricing.engine import estimate_price
from app.modules.pricing.schemas import EstimateInput, PriceEstimate

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/estimate", response_model=PriceEstimate)
async def estimate(payload: EstimateInput) -> PriceEstimate:
    result = estimate_price(
        capability=payload.capability,
        material=payload.material,
        quantity=payload.quantity,
        complexity=payload.complexity,
        kg_per_piece=payload.kg_per_piece,
    )
    return PriceEstimate.model_validate(result)
