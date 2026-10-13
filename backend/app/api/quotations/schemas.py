from app.core.schemas import CamelModel


class QuotationOut(CamelModel):
    id: str
    rfq_id: str
    supplier_id: str
    supplier_name: str
    supplier_city: str
    supplier_score: float
    verified: bool
    total_price_rials: int
    lead_time_days: int
    valid_until: str
    note: str | None = None
    submitted_at: str


class CreateQuotationInput(CamelModel):
    total_price_rials: int
    lead_time_days: int
    valid_until: str
    note: str | None = None
