"""مسیر برآورد قیمت — عمومی، بدون نیاز به احراز هویت."""

from fastapi import APIRouter

from app.api.pricing.schemas import EstimateInput, PriceEstimate
from app.services.pricing import estimate_price

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/estimate", response_model=PriceEstimate)
async def estimate(payload: EstimateInput):
    result = estimate_price(
        capability=payload.capability,
        material=payload.material,
        quantity=payload.quantity,
        complexity=payload.complexity,
        kg_per_piece=payload.kg_per_piece,
    )
    return PriceEstimate(**result)
