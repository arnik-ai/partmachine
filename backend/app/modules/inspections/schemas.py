import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.modules.orders.schemas import OrderFileOut, OrderPartyOut

# none: کارفرما (هنوز) آزمایشگاهی انتخاب نکرده است
InspectionState = Literal["none", "requested", "ready", "passed", "failed"]


class QcLabList(CamelModel):
    """آزمایشگاه‌های تأییدشده که کارفرما می‌تواند برای بازرسی انتخاب کند."""

    items: list[OrderPartyOut]


class InspectionOut(CamelModel):
    status: InspectionState
    lab: OrderPartyOut | None = None
    # شماره‌ی دور فعلی (۰ یعنی قطعه‌ساز هنوز آمادگی را اعلام نکرده است)
    attempt: int = 0
    requested_at: datetime | None = None
    ready_at: datetime | None = None
    # آخرین نتیجه (پس از رد، تا نتیجه‌ی دور بعد می‌ماند)
    result_at: datetime | None = None
    result_by_name: str | None = None
    result_note: str = ""
    report: OrderFileOut | None = None
    # فقط برای آزمایشگاه: پذیرش تعهد عدم افشا و فایل‌های فنی سفارش (فهرست پس از پذیرش)
    nda_accepted: bool | None = None
    file_count: int | None = None
    files: list[OrderFileOut] | None = None
    # کارهایی که بیننده همین حالا مجاز است
    can_choose_lab: bool = False
    can_remove: bool = False
    can_mark_ready: bool = False
    can_record_result: bool = False


def _clean(value: str) -> str:
    return normalize_text(value)


class ChooseLabInput(CamelModel):
    lab_organization_id: uuid.UUID


class MarkReadyInput(CamelModel):
    """توضیح اختیاری برای آزمایشگاه (مثلاً محل و زمان بازدید)."""

    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)


class InspectionResultInput(CamelModel):
    # دوری که آزمایشگاه نتیجه‌اش را ثبت می‌کند؛ تکرار همان درخواست بی‌اثر است
    attempt: int = Field(ge=1)
    passed: bool
    note: str = Field(default="", max_length=1000)
    # گزارش بازرسی لازم است؛ خطای فارسی همین فیلد در سرویس داده می‌شود
    file_id: uuid.UUID | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)
