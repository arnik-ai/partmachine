import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.catalog import Capability
from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.core.time import business_today
from app.modules.rfqs.schemas import QuotationStatus, RfqStatus

# سقف مبلغ: ۱۰^۱۵ ریال؛ زیر 2^53 تا عدد در جاوااسکریپت هم دقیق بماند
MAX_PRICE_RIALS = 10**15

QuotationOutcome = Literal["pending", "won", "lost", "withdrawn", "cancelled"]


class CreateQuotationInput(CamelModel):
    """ورودی ثبت، ثبت دوباره و ویرایش پیشنهاد."""

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
    status: QuotationStatus
    revision: int
    submitted_at: datetime
    updated_at: datetime
    is_awarded: bool


class RfqBrief(CamelModel):
    id: uuid.UUID
    title: str
    status: RfqStatus
    capability: Capability
    delivery_city: str
    quotes_due: date
    deadline: date


class MyQuotationOut(QuotationOut):
    rfq: RfqBrief
    outcome: QuotationOutcome
    # پیشنهاد برنده سفارش دارد
    order_id: uuid.UUID | None = None


class MyQuotationPage(CamelModel):
    items: list[MyQuotationOut]
    total: int
    limit: int
    offset: int
