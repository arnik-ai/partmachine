import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator

from app.core.catalog import Capability
from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.core.time import business_today
from app.modules.agreements.schemas import AcceptedAgreementIn

# وضعیت مؤثر — جزئیات در lifecycle.py
RfqStatus = Literal[
    "draft", "published", "quoting", "evaluating", "expired", "awarded", "closed", "cancelled"
]
FileKind = Literal["pdf", "cad", "drawing", "image", "other"]
QuotationStatus = Literal["active", "withdrawn"]

QUOTES_DUE_AFTER_DEADLINE = "مهلت دریافت پیشنهاد نمی‌تواند بعد از مهلت تحویل باشد."


class RfqFileOut(CamelModel):
    id: uuid.UUID
    name: str
    size: int
    kind: FileKind


def _not_past(value: date, message: str) -> date:
    if value < business_today():
        raise ValueError(message)
    return value


class CreateRfqInput(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    capability: Capability
    material: str = Field(min_length=1, max_length=100)
    quantity: int = Field(gt=0, le=10_000_000)
    delivery_city: str = Field(min_length=1, max_length=100)
    deadline: date
    # اختیاری؛ پیش‌فرض: هفت روز بعد، و نه دیرتر از مهلت تحویل
    quotes_due: date | None = None
    # شناسه‌ی فایل‌هایی که پیش‌تر با POST /files (purpose=rfq_attachment) بارگذاری شده‌اند
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    accepted_agreements: list[AcceptedAgreementIn] = Field(default_factory=list, max_length=5)

    @field_validator("title", "description", "material", "delivery_city")
    @classmethod
    def _clean(cls, value: str) -> str:
        return normalize_text(value)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        if len(value) < 3:
            raise ValueError("عنوان درخواست را کامل‌تر بنویسید (حداقل ۳ کاراکتر).")
        return value

    @field_validator("deadline")
    @classmethod
    def _deadline_not_past(cls, value: date) -> date:
        return _not_past(value, "مهلت تحویل نمی‌تواند تاریخ گذشته باشد.")

    @field_validator("quotes_due")
    @classmethod
    def _quotes_due_valid(cls, value: date | None, info: ValidationInfo) -> date | None:
        if value is None:
            return None
        _not_past(value, "مهلت دریافت پیشنهاد نمی‌تواند تاریخ گذشته باشد.")
        deadline = info.data.get("deadline")
        if deadline is not None and value > deadline:
            raise ValueError(QUOTES_DUE_AFTER_DEADLINE)
        return value


class CancelRfqInput(CamelModel):
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return normalize_text(value) or None if value else None


class RescheduleRfqInput(CamelModel):
    quotes_due: date
    # اختیاری؛ اگر نیاید مهلت تحویل فعلی می‌ماند
    deadline: date | None = None

    @field_validator("quotes_due")
    @classmethod
    def _quotes_due_not_past(cls, value: date) -> date:
        return _not_past(value, "مهلت دریافت پیشنهاد نمی‌تواند تاریخ گذشته باشد.")

    @field_validator("deadline")
    @classmethod
    def _deadline_valid(cls, value: date | None, info: ValidationInfo) -> date | None:
        if value is None:
            return None
        _not_past(value, "مهلت تحویل نمی‌تواند تاریخ گذشته باشد.")
        quotes_due = info.data.get("quotes_due")
        if quotes_due is not None and quotes_due > value:
            raise ValueError(QUOTES_DUE_AFTER_DEADLINE)
        return value


class MyQuotationRef(CamelModel):
    """پیشنهاد قطعه‌ساز جاری برای همین RFQ (فقط در نمای قطعه‌ساز)."""

    id: uuid.UUID
    status: QuotationStatus


class RfqOut(CamelModel):
    id: uuid.UUID
    title: str
    description: str
    capability: Capability
    material: str
    quantity: int
    delivery_city: str
    deadline: date
    quotes_due: date
    status: RfqStatus
    files: list[RfqFileOut]
    file_count: int
    # تعداد پیشنهادهای فعال فقط برای سازمان صاحب درخواست؛ برای دیگران null
    quotations_count: int | None
    created_at: datetime
    is_owner: bool
    awarded_quotation_id: uuid.UUID | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    # فقط در نمای قطعه‌ساز
    nda_accepted: bool | None = None
    my_quotation: MyQuotationRef | None = None


class RfqPage(CamelModel):
    items: list[RfqOut]
    total: int
    limit: int
    offset: int
