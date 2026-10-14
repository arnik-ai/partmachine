"""خطاهای برنامه و تبدیل آن‌ها به پاسخ JSON یکسان با پیام فارسی.

قاعده: کاربر هرگز stack trace یا جزئیات پایگاه داده نمی‌بیند؛ فقط `detail` فارسی،
یک `code` ثابت برای کلاینت، خطاهای هر فیلد (در 422) و `requestId` برای پیگیری.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var
from app.core.text import fa_digits

logger = logging.getLogger("partmachine.errors")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(
        self,
        detail: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
        errors: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.headers = headers
        self.errors = errors


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"


class Unauthorized(AppError):
    status_code = 401
    code = "not_authenticated"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class TooManyRequests(AppError):
    status_code = 429
    code = "rate_limited"


class ServiceUnavailable(AppError):
    status_code = 503
    code = "service_unavailable"


GENERIC_500 = (
    "خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید؛ اگر تکرار شد با پشتیبانی تماس بگیرید."
)

_HTTP_DEFAULTS = {
    400: ("bad_request", "درخواست نامعتبر است."),
    401: ("not_authenticated", "برای ادامه وارد حساب کاربری شوید."),
    403: ("forbidden", "اجازه‌ی انجام این کار را ندارید."),
    404: ("not_found", "موردی که دنبالش بودید پیدا نشد."),
    405: ("method_not_allowed", "این عملیات پشتیبانی نمی‌شود."),
    413: ("payload_too_large", "حجم درخواست بیش از حد مجاز است."),
    429: ("rate_limited", "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید."),
}


def error_body(
    detail: str, code: str, errors: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    body: dict[str, Any] = {"detail": detail, "code": code}
    if errors:
        body["errors"] = errors
    request_id = request_id_var.get()
    if request_id:
        body["requestId"] = request_id
    return body


def _field_name(loc: tuple[Any, ...]) -> str:
    """مسیر فیلد با همان نام‌های camelCase که فرانت می‌فرستد (مثلاً companyName)."""
    parts = [
        to_camel(p) if isinstance(p, str) and "_" in p else str(p)
        for p in loc
        if p not in ("body", "query", "path", "header", "cookie")
    ]
    return ".".join(parts)


def validation_message(err: dict[str, Any]) -> str:
    """پیام خطای pydantic را به فارسی قابل‌فهم تبدیل می‌کند."""
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind == "missing":
        return "این فیلد الزامی است."
    if kind == "string_too_short":
        if ctx.get("min_length") == 1:
            return "این فیلد نباید خالی باشد."
        return f"باید حداقل {fa_digits(ctx.get('min_length'))} کاراکتر باشد."
    if kind == "string_too_long":
        return f"حداکثر {fa_digits(ctx.get('max_length'))} کاراکتر مجاز است."
    if kind == "too_long":
        return f"حداکثر {fa_digits(ctx.get('max_length'))} مورد مجاز است."
    if kind == "greater_than":
        return f"باید بیشتر از {fa_digits(ctx.get('gt'))} باشد."
    if kind == "greater_than_equal":
        return f"باید حداقل {fa_digits(ctx.get('ge'))} باشد."
    if kind == "less_than":
        return f"باید کمتر از {fa_digits(ctx.get('lt'))} باشد."
    if kind == "less_than_equal":
        return f"باید حداکثر {fa_digits(ctx.get('le'))} باشد."
    if kind in ("int_parsing", "int_type", "int_from_float"):
        return "باید یک عدد صحیح باشد."
    if kind in ("float_parsing", "float_type", "finite_number"):
        return "باید یک عدد باشد."
    if kind in ("literal_error", "enum"):
        return "مقدار انتخاب‌شده معتبر نیست."
    if kind.startswith("date") or kind.startswith("datetime"):
        return "تاریخ معتبر نیست (قالب درست: YYYY-MM-DD)."
    if kind == "uuid_parsing" or kind == "uuid_type":
        return "شناسه معتبر نیست."
    if kind in ("bool_parsing", "bool_type"):
        return "مقدار باید درست یا نادرست باشد."
    if kind == "json_invalid":
        return "بدنه‌ی درخواست JSON معتبر نیست."
    if kind in ("string_type", "list_type", "dict_type", "model_type", "model_attributes_type"):
        return "نوع مقدار معتبر نیست."
    if kind == "value_error":
        error = ctx.get("error")
        message = str(error) if error is not None else str(err.get("msg", ""))
        if "email" in message.lower():
            return "ایمیل معتبر نیست."
        # پیام‌های ValueError خودمان فارسی‌اند
        return message.removeprefix("Value error, ")
    return "مقدار واردشده معتبر نیست."


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.detail, exc.code, exc.errors),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": _field_name(tuple(e.get("loc", ()))), "message": validation_message(e)}
            for e in exc.errors()
        ]
        detail = errors[0]["message"] if len(errors) == 1 else "لطفاً خطاهای فرم را برطرف کنید."
        return JSONResponse(error_body(detail, "validation_error", errors), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, default_detail = _HTTP_DEFAULTS.get(exc.status_code, ("error", "درخواست انجام نشد."))
        detail = (
            exc.detail
            if isinstance(exc.detail, str) and _is_persian(exc.detail)
            else default_detail
        )
        return JSONResponse(
            error_body(detail, code), status_code=exc.status_code, headers=exc.headers
        )


def _is_persian(text: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in text)
