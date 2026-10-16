import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.modules.files.content import FileKind
from app.modules.orders.lifecycle import Action, Side

OrderStatus = Literal[
    "awaiting_contract",
    "awaiting_prepayment",
    "awaiting_material",
    "in_production",
    "in_inspection",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "disputed",
]
ActorSide = Literal["buyer", "supplier", "qc", "admin", "system"]
StatusGroup = Literal["active", "completed", "cancelled", "all"]


class OrderPartyOut(CamelModel):
    organization_id: uuid.UUID
    name: str


class OrderSupplierOut(OrderPartyOut):
    supplier_id: uuid.UUID
    verified: bool


InspectionStatus = Literal["requested", "ready", "passed", "failed"]


class OrderInspectionSummaryOut(CamelModel):
    """خلاصه‌ی بازرسی کیفیت (اگر کارفرما آزمایشگاه انتخاب کرده باشد)."""

    status: InspectionStatus
    lab: OrderPartyOut


class OrderFileOut(CamelModel):
    id: uuid.UUID
    name: str
    size: int
    kind: FileKind


class CancelRequestOut(CamelModel):
    """درخواست لغو یک طرف پس از امضای قرارداد، در انتظار موافقت طرف دیگر (O11)."""

    side: Literal["buyer", "supplier"]
    reason: str
    requested_at: datetime


class OrderDisputeOut(CamelModel):
    """اختلاف باز سفارش (مشکلی که یکی از دو طرف اعلام کرده و پشتیبانی بررسی می‌کند)."""

    id: uuid.UUID
    opened_side: Literal["buyer", "supplier"]
    opened_by_name: str | None = None
    reason: str
    file: OrderFileOut | None = None
    previous_status: OrderStatus
    opened_at: datetime


class OrderRatingOut(CamelModel):
    """امتیاز کارفرما پس از تکمیل؛ توضیح فقط برای دو طرف همین سفارش."""

    score: int
    comment: str
    rated_by_name: str | None = None
    updated_at: datetime


class OrderEventOut(CamelModel):
    id: uuid.UUID
    action: str
    from_status: OrderStatus | None = None
    to_status: OrderStatus | None = None
    actor_name: str | None = None
    actor_side: ActorSide
    note: str
    file: OrderFileOut | None = None
    created_at: datetime


class OrderOut(CamelModel):
    id: uuid.UUID
    number: int
    status: OrderStatus
    title: str
    material: str
    quantity: int
    delivery_city: str
    # برای آزمایشگاه null است؛ مبلغ و پرداخت‌ها فقط برای دو طرف و ادمین است
    amount_rials: int | None
    lead_time_days: int
    delivery_due: date
    is_overdue: bool
    # کارفرما قطعه یا مواد را می‌فرستد؛ مهلت تحویل از روز رسیدن آن شمرده می‌شود
    material_from_buyer: bool = False
    material_received_at: date | None = None
    rfq_id: uuid.UUID
    quotation_id: uuid.UUID
    buyer: OrderPartyOut
    supplier: OrderSupplierOut
    # طرفی که بیننده در این سفارش است، و کارهایی که همین حالا مجاز به انجامشان است
    my_side: Side
    next_actions: list[Action]
    inspection: OrderInspectionSummaryOut | None = None
    cancel_request: CancelRequestOut | None = None
    created_at: datetime
    updated_at: datetime
    shipped_at: datetime | None = None
    delivered_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None


class OrderDetailOut(OrderOut):
    events: list[OrderEventOut]
    dispute: OrderDisputeOut | None = None
    rating: OrderRatingOut | None = None
    # کارفرما پس از تکمیل می‌تواند امتیاز بدهد یا آن را تغییر دهد
    can_rate: bool = False


class OrderPage(CamelModel):
    items: list[OrderOut]
    total: int
    limit: int
    offset: int


def _clean(value: str) -> str:
    return normalize_text(value)


class CancelOrderInput(CamelModel):
    """دلیل برای لغو پیش از امضا و برای درخواست لغو پس از امضا لازم است (خطای فارسی همین فیلد
    در سرویس داده می‌شود)؛ موافقت با درخواست لغو طرف مقابل دلیل نمی‌خواهد."""

    reason: str = Field(default="", max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        return _clean(value)


class OpenDisputeInput(CamelModel):
    reason: str = Field(max_length=1000)
    file_id: uuid.UUID | None = None

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        cleaned = _clean(value)
        if len(cleaned) < 10:
            raise ValueError("مشکل را کمی دقیق‌تر شرح دهید (دست‌کم ۱۰ نویسه).")
        return cleaned


class KeepOrderInput(CamelModel):
    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)


class ShipOrderInput(CamelModel):
    """اطلاعات ارسال (مثلاً نام باربری و شماره‌ی بارنامه) و سند اختیاری."""

    note: str = Field(default="", max_length=500)
    file_id: uuid.UUID | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)


class ConfirmDeliveryInput(CamelModel):
    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)


class ConfirmMaterialInput(CamelModel):
    """توضیح اختیاری مجری درباره‌ی قطعه یا مواد رسیده (مثلاً تعداد و سالم بودن)."""

    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _clean(value)
