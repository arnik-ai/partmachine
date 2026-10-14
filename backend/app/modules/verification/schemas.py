import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text
from app.modules.files.content import FileKind

VerificationStatus = Literal["pending", "approved", "rejected", "revoked"]

MAX_DOCUMENTS = 5


class VerificationFileOut(CamelModel):
    id: uuid.UUID
    name: str
    size: int
    kind: FileKind


class VerificationOut(CamelModel):
    """آخرین درخواست تأیید، همان‌طور که خود قطعه‌ساز می‌بیند."""

    id: uuid.UUID
    status: VerificationStatus
    note: str
    created_at: datetime
    decided_at: datetime | None = None
    decision_reason: str | None = None
    revoked_at: datetime | None = None
    revoke_reason: str | None = None
    files: list[VerificationFileOut]


class AdminVerificationOut(VerificationOut):
    organization_id: uuid.UUID
    supplier_id: uuid.UUID | None
    company_name: str
    city: str
    submitted_by_name: str
    submitted_by_email: str
    decided_by_name: str | None = None


class AdminVerificationPage(CamelModel):
    items: list[AdminVerificationOut]
    total: int
    limit: int
    offset: int


class SubmitVerificationInput(CamelModel):
    file_ids: list[uuid.UUID] = Field(max_length=MAX_DOCUMENTS)
    note: str = Field(default="", max_length=1000)

    @field_validator("file_ids")
    @classmethod
    def _files(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        unique = list(dict.fromkeys(value))
        if not unique:
            raise ValueError("حداقل یک مدرک بارگذاری کنید.")
        return unique

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return normalize_text(value)


class DecisionInput(CamelModel):
    """دلیل برای رد و لغو الزامی است و به قطعه‌ساز نمایش داده می‌شود؛ برای تأیید اختیاری است."""

    reason: str = Field(default="", max_length=1000)

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        return normalize_text(value)
