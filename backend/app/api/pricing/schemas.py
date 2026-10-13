from app.core.schemas import CamelModel


class EstimateInput(CamelModel):
    capability: str
    material: str
    quantity: int
    complexity: str = "normal"
    kg_per_piece: float | None = None


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
