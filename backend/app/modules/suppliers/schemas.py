import re
import uuid
from datetime import date
from urllib.parse import urlsplit

from pydantic import Field, field_validator

from app.core.catalog import Capability
from app.core.schemas import CamelModel
from app.core.text import ascii_digits, normalize_text


class TrustScoreComponent(CamelModel):
    key: str
    label: str
    value: float
    weight: float
    explanation: str


class TrustScoreOut(CamelModel):
    trust: float
    risk: float
    reliability: float
    quality: float
    components: list[TrustScoreComponent]


class SupplierMachine(CamelModel):
    name: str
    model: str
    count: int


class SupplierCertification(CamelModel):
    title: str
    issuer: str
    valid_until: str | None = None


class PortfolioImageOut(CamelModel):
    """`url` نسبی به آدرس API است و تصویر را مستقیم (بدون ورود) نمایش می‌دهد."""

    id: uuid.UUID
    url: str


class SupplierOut(CamelModel):
    id: uuid.UUID
    company_name: str
    description: str
    city: str
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    founded_year: int | None = None
    employee_count: int | None = None
    capabilities: list[Capability]
    machines: list[SupplierMachine]
    certifications: list[SupplierCertification]
    production_capacity_per_month: int | None = None
    lead_time_days: int
    completed_jobs: int
    on_time_delivery_rate: float
    response_time_hours: float
    verified: bool
    score: TrustScoreOut
    gallery_titles: list[str] = []
    portfolio: list[PortfolioImageOut] = []


class MySupplierOut(SupplierOut):
    """پروفایل سازمان خود قطعه‌ساز، با وضعیت‌هایی که فقط خودش می‌بیند."""

    # در فهرست عمومی دیده می‌شود؟ (شهر و حداقل یک خدمت لازم است)
    listed: bool
    # فقط مدیر سازمان ویرایش می‌کند
    can_edit: bool


class SupplierPage(CamelModel):
    items: list[SupplierOut]
    total: int
    limit: int
    offset: int


# --- ورودی ویرایش پروفایل -------------------------------------------------------------------

_PHONE = re.compile(r"^\+?[0-9][0-9 -]{5,18}[0-9]$")
_LATEST_FOUNDED_YEAR = 1500  # سال شمسی؛ سقف سخاوتمندانه تا تقویم سرور مهم نباشد


def _clean(value: str) -> str:
    return normalize_text(value)


class SupplierMachineIn(CamelModel):
    name: str = Field(min_length=2, max_length=100)
    model: str = Field(default="", max_length=100)
    count: int = Field(default=1, ge=1, le=1000)

    @field_validator("name", "model")
    @classmethod
    def _text(cls, value: str) -> str:
        return _clean(value)


class SupplierCertificationIn(CamelModel):
    title: str = Field(min_length=2, max_length=150)
    issuer: str = Field(default="", max_length=150)
    valid_until: date | None = None

    @field_validator("title", "issuer")
    @classmethod
    def _text(cls, value: str) -> str:
        return _clean(value)


class SupplierProfileInput(CamelModel):
    """کل پروفایل عمومی، همان‌طور که فرم می‌فرستد (جایگزینی کامل، نه به‌روزرسانی جزئی).

    امتیاز اعتماد، تعداد پروژه‌ها و نشان «تأییدشده» در اختیار پلتفرم‌اند و این‌جا نیستند.
    """

    company_name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    city: str = Field(min_length=2, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    website: str | None = Field(default=None, max_length=255)
    founded_year: int | None = Field(default=None, ge=1300, le=_LATEST_FOUNDED_YEAR)
    employee_count: int | None = Field(default=None, ge=1, le=100_000)
    capabilities: list[Capability] = Field(max_length=10)
    machines: list[SupplierMachineIn] = Field(default_factory=list, max_length=30)
    certifications: list[SupplierCertificationIn] = Field(default_factory=list, max_length=20)
    production_capacity_per_month: int | None = Field(default=None, ge=1, le=100_000_000)
    lead_time_days: int = Field(ge=1, le=365)

    @field_validator("company_name", "city")
    @classmethod
    def _required_text(cls, value: str) -> str:
        cleaned = _clean(value)
        if len(cleaned) < 2:
            raise ValueError("این فیلد را کامل وارد کنید.")
        return cleaned

    @field_validator("description")
    @classmethod
    def _description(cls, value: str) -> str:
        return _clean(value)

    @field_validator("address")
    @classmethod
    def _optional_text(cls, value: str | None) -> str | None:
        return _clean(value) or None if value is not None else None

    @field_validator("capabilities")
    @classmethod
    def _capabilities(cls, value: list[Capability]) -> list[Capability]:
        unique = list(dict.fromkeys(value))
        if not unique:
            raise ValueError("حداقل یک خدمت را انتخاب کنید.")
        return unique

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        cleaned = ascii_digits(_clean(value or ""))
        if not cleaned:
            return None
        if not _PHONE.match(cleaned):
            raise ValueError("شماره تماس معتبر نیست؛ فقط رقم، فاصله، خط تیره و + مجاز است.")
        return cleaned

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        cleaned = (value or "").strip()
        if not cleaned:
            return None
        if not re.match(r"^https?://", cleaned, re.IGNORECASE):
            cleaned = f"https://{cleaned}"
        invalid = ValueError("آدرس وب‌سایت معتبر نیست (مثال: example.ir).")
        if any(ch.isspace() or ord(ch) < 32 for ch in cleaned):
            raise invalid
        try:
            parts = urlsplit(cleaned)
            host = parts.hostname or ""
        except ValueError:
            raise invalid from None
        # فقط http/https: لینک در پروفایل عمومی نمایش داده می‌شود (نه javascript: یا data:)
        if parts.scheme.lower() not in ("http", "https") or "." not in host or parts.username:
            raise invalid
        return cleaned
