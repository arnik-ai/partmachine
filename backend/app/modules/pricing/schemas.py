from typing import Literal

from pydantic import Field

from app.core.catalog import Capability
from app.core.schemas import CamelModel


class EstimateInput(CamelModel):
    capability: Capability
    material: str = Field(min_length=1, max_length=100)
    quantity: int = Field(gt=0, le=10_000_000)
    complexity: Literal["simple", "normal", "complex"] = "normal"
    kg_per_piece: float | None = Field(default=None, gt=0, le=10_000)


class CostComponent(CamelModel):
    key: str
    label: str
    amount_rials: int
    detail: str


class PriceEstimate(CamelModel):
    unit_price_rials: int
    total_price_rials: int
    range_low_rials: int
    range_high_rials: int
    total_hours: float
    components: list[CostComponent]
