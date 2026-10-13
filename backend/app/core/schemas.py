from pydantic import BaseModel, ConfigDict
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
