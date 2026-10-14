import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.core.time import business_today

# سقف مبلغ: ۱۰^۱۵ ریال؛ زیر 2^53 تا عدد در جاوااسکریپت هم دقیق بماند
MAX_PRICE_RIALS = 10**15


class CreateQuotationInput(CamelModel):
    total_price_rials: int = Field(gt=0, le=MAX_PRICE_RIALS, description="قیمت کل به ریال")
    lead_time_days: int = Field(gt=0, le=3650)
    valid_until: date
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("valid_until")
    @classmethod
    def _valid_until_not_past(cls, value: date) -> date:
        if value < business_today():
            raise ValueError("تاریخ اعتبار پیشنهاد نمی‌تواند گذشته باشد.")
        return value

    @field_validator("note")
    @classmethod
    def _clean_note(cls, value: str | None) -> str | None:
        return normalize_text(value) or None if value else None


class QuotationOut(CamelModel):
    id: uuid.UUID
    rfq_id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_name: str
    supplier_city: str
    supplier_score: float
    verified: bool
    total_price_rials: int = Field(description="قیمت کل به ریال")
    lead_time_days: int
    valid_until: date
    note: str | None = None
    submitted_at: datetime
    is_awarded: bool
