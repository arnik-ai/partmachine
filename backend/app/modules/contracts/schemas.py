import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text

ContractStatus = Literal["draft", "partially_signed", "signed"]
Side = Literal["buyer", "supplier"]


class ContractArticleOut(CamelModel):
    number: int
    title: str
    paragraphs: list[str]


class ContractTermsOut(CamelModel):
    delivery_due: date
    prepayment_percent: int
    penalty_per_day_bp: int
    penalty_cap_percent: int


class ContractSignatureOut(CamelModel):
    side: Side
    signer_name: str
    organization_name: str
    signed_at: datetime


class ContractVersionSummary(CamelModel):
    number: int
    created_at: datetime
    created_by_name: str | None = None
    change_note: str
    content_sha256: str
    signatures: list[ContractSignatureOut]


class ContractOut(CamelModel):
    order_id: uuid.UUID
    order_number: int
    status: ContractStatus
    version: int
    terms: ContractTermsOut
    articles: list[ContractArticleOut]
    content_sha256: str
    template_version: str
    created_at: datetime
    signed_at: datetime | None = None
    signatures: list[ContractSignatureOut]
    # نسخه‌های قبلی (تازه‌ترین اول)، برای شفافیت تغییرات
    history: list[ContractVersionSummary]
    my_side: Literal["buyer", "supplier", "admin"]
    # سفارش هنوز در مرحله‌ی قرارداد است (نه امضاشده، نه لغوشده)
    is_open: bool
    # کارفرما پیش از امضای هر دو طرف پارامترها را تغییر می‌دهد (O5)
    can_edit: bool
    # مدیر سازمانِ طرفی که هنوز امضا نکرده (O2)
    can_sign: bool
    # قطعه‌ساز می‌تواند درخواست اصلاح بفرستد
    can_request_change: bool
    draft_notice: str


class UpdateContractInput(CamelModel):
    delivery_due: date
    prepayment_percent: int = Field(ge=0, le=100)
    penalty_per_day_bp: int = Field(ge=0, le=1000)
    penalty_cap_percent: int = Field(ge=0, le=100)
    change_note: str = Field(default="", max_length=500)

    @field_validator("change_note")
    @classmethod
    def _note(cls, value: str) -> str:
        return normalize_text(value)


class SignContractInput(CamelModel):
    """نسخه‌ای که امضاکننده خوانده است؛ اگر در این فاصله عوض شده باشد امضا رد می‌شود."""

    version: int = Field(ge=1)
    password: str = Field(min_length=1, max_length=128)


class ChangeRequestInput(CamelModel):
    note: str = Field(min_length=3, max_length=1000)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        cleaned = normalize_text(value)
        if len(cleaned) < 3:
            raise ValueError("بنویسید چه چیزی باید اصلاح شود.")
        return cleaned
