import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.modules.orders.schemas import OrderFileOut, OrderStatus

Resolution = Literal["resume", "complete", "cancel"]
DisputeStatus = Literal["open", "resolved"]


class AdminDisputeOut(CamelModel):
    id: uuid.UUID
    order_id: uuid.UUID
    order_number: int
    order_title: str
    order_status: OrderStatus
    amount_rials: int
    buyer_name: str
    supplier_name: str
    opened_side: Literal["buyer", "supplier"]
    opened_by_name: str | None = None
    reason: str
    file: OrderFileOut | None = None
    previous_status: OrderStatus
    opened_at: datetime
    status: DisputeStatus
    resolution: Resolution | None = None
    decision_reason: str | None = None
    resolved_by_name: str | None = None
    resolved_at: datetime | None = None


class AdminDisputePage(CamelModel):
    items: list[AdminDisputeOut]
    total: int
    limit: int
    offset: int


class ResolveDisputeInput(CamelModel):
    resolution: Resolution
    reason: str = Field(max_length=1000)

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        cleaned = normalize_text(value)
        if len(cleaned) < 3:
            raise ValueError("دلیل تصمیم را بنویسید؛ هر دو طرف آن را می‌بینند.")
        return cleaned
