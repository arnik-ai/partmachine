from pydantic import Field

from app.core.schemas import CamelModel


class AcceptedAgreementIn(CamelModel):
    """نسخه‌ای از یک متن که کاربر هنگام ارسال فرم پذیرفته است."""

    key: str = Field(min_length=1, max_length=40)
    version: str = Field(min_length=1, max_length=20)


class AgreementItemOut(CamelModel):
    id: str
    text: str
    critical: bool


class AgreementOut(CamelModel):
    key: str
    title: str
    version: str
    items: list[AgreementItemOut]
