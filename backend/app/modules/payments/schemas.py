import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import ascii_digits, normalize_text
from app.modules.orders.schemas import OrderFileOut

PaymentKind = Literal["prepayment", "final"]
PaymentStatus = Literal["pending", "reported", "confirmed"]


class PaymentOut(CamelModel):
    id: uuid.UUID
    number: int
    kind: PaymentKind
    percent: int
    amount_rials: int
    status: PaymentStatus
    reported_at: datetime | None = None
    reported_by_name: str | None = None
    paid_on: date | None = None
    reference: str
    note: str
    receipt: OrderFileOut | None = None
    confirmed_at: datetime | None = None
    confirmed_by_name: str | None = None
    # آخرین دلیل رد (قسط پس از رد دوباره «در انتظار» است)
    rejection_reason: str | None = None
    can_report: bool
    can_confirm: bool


class PaymentsOut(CamelModel):
    """اقساط سفارش طبق قرارداد امضاشده؛ پیش از امضای قرارداد فهرست خالی است."""

    items: list[PaymentOut]
    total_rials: int
    confirmed_rials: int


class ReportPaymentInput(CamelModel):
    paid_on: date
    # شماره‌ی پیگیری یا شماره‌ی حواله/چک
    reference: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=500)
    file_id: uuid.UUID | None = None

    @field_validator("reference")
    @classmethod
    def _reference(cls, value: str) -> str:
        return ascii_digits(normalize_text(value))

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return normalize_text(value)


class RejectPaymentInput(CamelModel):
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        cleaned = normalize_text(value)
        if len(cleaned) < 3:
            raise ValueError("دلیل را بنویسید؛ کارفرما آن را می‌بیند.")
        return cleaned
