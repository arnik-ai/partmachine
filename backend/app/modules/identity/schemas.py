import uuid
from typing import Annotated, Literal

from pydantic import EmailStr, Field, ValidationInfo, field_validator

from app.core.catalog import Role, SignupRole
from app.core.schemas import CamelModel
from app.core.text import ascii_digits, normalize_text
from app.modules.agreements.schemas import AcceptedAgreementIn


class UserOut(CamelModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    organization_id: uuid.UUID
    company_name: str | None = None
    verified: bool
    org_role: Literal["owner", "member"] = "owner"
    # شماره‌ی موبایل تأییدشده (فقط پس از تأیید با کد ذخیره می‌شود)
    phone: str | None = None


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
    # با لینک دعوت: سازمان و نقش از دعوت می‌آید و نام شرکت لازم نیست
    invite_token: str | None = Field(default=None, min_length=16, max_length=128)
    company_name: str | None = Field(default=None, max_length=200, validate_default=True)
    # نسخه‌ی قوانینی که کاربر در فرم پذیرفته است (در سرویس بررسی و ثبت می‌شود)
    accepted_agreements: list[AcceptedAgreementIn] = Field(default_factory=list, max_length=10)

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
        if (
            not cleaned
            and info.data.get("role") == "supplier"
            and not info.data.get("invite_token")
        ):
            raise ValueError("نام شرکت یا کارگاه برای قطعه‌سازها الزامی است.")
        return cleaned or None


# --- حساب کاربری: تغییر رمز، بازیابی رمز و تأیید موبایل ------------------------------------

Password = Annotated[str, Field(min_length=8, max_length=128)]


def _clean_code(value: str) -> str:
    code = ascii_digits(value).strip()
    if len(code) != 6 or not code.isdigit():
        raise ValueError("کد ۶ رقمی را وارد کنید.")
    return code


def normalize_mobile(value: str) -> str:
    """موبایل ایرانی را به قالب یکتای +989xxxxxxxxx تبدیل می‌کند (ارقام فارسی هم پذیرفته می‌شوند)."""
    digits = "".join(ch for ch in ascii_digits(value) if ch.isdigit())
    if digits.startswith("0098"):
        digits = digits[4:]
    elif digits.startswith("98") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) != 10 or not digits.startswith("9"):
        raise ValueError("شماره‌ی موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).")
    return f"+98{digits}"


class ChangePasswordInput(CamelModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class PasswordResetRequestInput(CamelModel):
    email: EmailStr = Field(max_length=255)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirmInput(PasswordResetRequestInput):
    code: str = Field(max_length=20)
    new_password: Password

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _clean_code(value)


class PhoneCodeInput(CamelModel):
    phone: str = Field(max_length=30)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_mobile(value)


class PhoneVerifyInput(PhoneCodeInput):
    code: str = Field(max_length=20)

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _clean_code(value)


class AuthOptionsOut(CamelModel):
    """قابلیت‌هایی که به سرویس ارسال کد وابسته‌اند؛ فرانت لینکِ قابلیت خاموش را نشان نمی‌دهد."""

    password_reset: bool
    phone_verification: bool


class MessageOut(CamelModel):
    detail: str
