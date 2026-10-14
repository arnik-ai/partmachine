import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.catalog import Capability
from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.core.time import business_today

RfqStatus = Literal["draft", "published", "quoting", "awarded", "closed", "cancelled"]
FileKind = Literal["pdf", "cad", "drawing", "image", "other"]

MAX_FILE_BYTES = 50 * 1024 * 1024


class RfqFileIn(CamelModel):
    """فعلاً فقط متادیتای فایل. فیلدهای اضافه (مثل previewUrl) نادیده گرفته و ذخیره نمی‌شوند."""

    name: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0, le=MAX_FILE_BYTES)
    kind: FileKind = "other"


class RfqFileOut(CamelModel):
    name: str
    size: int
    kind: FileKind


class CreateRfqInput(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    capability: Capability
    material: str = Field(min_length=1, max_length=100)
    quantity: int = Field(gt=0, le=10_000_000)
    delivery_city: str = Field(min_length=1, max_length=100)
    deadline: date
    files: list[RfqFileIn] = Field(default_factory=list, max_length=10)

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
        if value < business_today():
            raise ValueError("مهلت تحویل نمی‌تواند تاریخ گذشته باشد.")
        return value


class RfqOut(CamelModel):
    id: uuid.UUID
    title: str
    description: str
    capability: Capability
    material: str
    quantity: int
    delivery_city: str
    deadline: date
    status: RfqStatus
    files: list[RfqFileOut]
    # تعداد پیشنهادها فقط برای سازمان صاحب درخواست؛ برای دیگران null
    quotations_count: int | None
    created_at: datetime
    is_owner: bool
    awarded_quotation_id: uuid.UUID | None = None


class RfqPage(CamelModel):
    items: list[RfqOut]
    total: int
    limit: int
    offset: int
