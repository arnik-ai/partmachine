import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.core.catalog import Role
from app.core.schemas import CamelModel
from app.core.text import normalize_text


class AdminUserOut(CamelModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    org_role: Literal["owner", "member"]
    organization_id: uuid.UUID
    organization_name: str
    is_active: bool
    # تأیید حساب مأمور خرید و آزمایشگاه (دستی، توسط ادمین)
    verified: bool
    # برای قطعه‌سازها: نشان «تأییدشده»ی پروفایل سازمان (از صف تأیید مدارک)
    supplier_id: uuid.UUID | None = None
    supplier_verified: bool | None = None
    created_at: datetime


class AdminUserPage(CamelModel):
    items: list[AdminUserOut]
    total: int
    limit: int
    offset: int


class AdminActionInput(CamelModel):
    """دلیل اختیاری؛ در رویدادهای audit ثبت می‌شود."""

    reason: str = Field(default="", max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        return normalize_text(value)


class AuditEventOut(CamelModel):
    id: uuid.UUID
    created_at: datetime
    action: str
    actor_id: uuid.UUID | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    organization_id: uuid.UUID | None = None
    organization_name: str | None = None
    entity_type: str
    entity_id: uuid.UUID | None = None
    data: dict[str, Any]
    request_id: str | None = None


class AuditEventPage(CamelModel):
    """بدون شمارش کل (جدول رویدادها بزرگ می‌شود)؛ `hasMore` برای صفحه‌ی بعد کافی است."""

    items: list[AuditEventOut]
    has_more: bool
    limit: int
    offset: int
