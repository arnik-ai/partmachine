from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.core.text import normalize_text


class RatingInput(CamelModel):
    score: int = Field(ge=1, le=5)
    # فقط در صفحه‌ی همین سفارش برای دو طرف دیده می‌شود
    comment: str = Field(default="", max_length=500)

    @field_validator("comment")
    @classmethod
    def _comment(cls, value: str) -> str:
        return normalize_text(value)
