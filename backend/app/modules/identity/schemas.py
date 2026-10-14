import uuid

from pydantic import EmailStr, Field, ValidationInfo, field_validator

from app.core.catalog import Role, SignupRole
from app.core.schemas import CamelModel
from app.core.text import normalize_text


class UserOut(CamelModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    organization_id: uuid.UUID
    company_name: str | None = None
    verified: bool


class AuthSession(CamelModel):
    """پاسخ ورود/ثبت‌نام/تازه‌سازی. refresh token در کوکی HttpOnly است، نه در بدنه."""

    user: UserOut
    access_token: str
    expires_in: int = Field(description="مدت اعتبار access token به ثانیه")


class LoginInput(CamelModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()


class RegisterInput(CamelModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    role: SignupRole
    company_name: str | None = Field(default=None, max_length=200, validate_default=True)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = normalize_text(value)
        if len(cleaned) < 2:
            raise ValueError("نام و نام خانوادگی را کامل وارد کنید.")
        return cleaned

    @field_validator("company_name")
    @classmethod
    def _company_for_supplier(cls, value: str | None, info: ValidationInfo) -> str | None:
        cleaned = normalize_text(value) if value else None
        if not cleaned and info.data.get("role") == "supplier":
            raise ValueError("نام شرکت یا کارگاه برای قطعه‌سازها الزامی است.")
        return cleaned or None
