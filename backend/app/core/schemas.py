from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """
    مدل پایه‌ی همه‌ی schemaها.

    خروجی JSON را camelCase می‌کند (companyName, accessToken, ...) تا دقیقاً
    با قرارداد تایپ‌های فرانت یکی باشد، و ورودی را هم با همان نام‌ها می‌پذیرد.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class FieldError(CamelModel):
    field: str
    message: str


class ErrorResponse(CamelModel):
    """شکل یکسان همه‌ی پاسخ‌های خطا — `detail` همیشه یک پیام فارسی قابل‌نمایش است."""

    detail: str
    code: str
    errors: list[FieldError] | None = None
    request_id: str | None = None


class PageParams(CamelModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10_000)
