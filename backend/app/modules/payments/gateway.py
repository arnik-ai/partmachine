"""درگاه پرداخت اینترنتی — فقط برای وجهی که خودِ تراشینو می‌گیرد (مثل هزینه‌ی دانلود قرارداد).

**پول سفارش‌ها از این‌جا رد نمی‌شود (O6).** پرداخت کارفرما به قطعه‌ساز مستقیم است و در سامانه
فقط اعلام و تأیید می‌شود (`service.py` همین پوشه). هر استفاده‌ی تازه از این فایل باید همین
مرز را نگه دارد.

تا وقتی `PAYMENT_GATEWAY=disabled` است (پیش‌فرض، و تا تصمیم مالک) هیچ تماسی با بیرون نمی‌رود و
`get_gateway().enabled` نادرست است؛ یعنی کد آماده است ولی خاموش. برای وصل کردن فقط دو تنظیم لازم
است: `PAYMENT_GATEWAY=zarinpal` و `PAYMENT_MERCHANT_ID`.

سرویس دیگر (زیبال، آیدی‌پی و…) یعنی یک کلاس تازه در همین فایل و یک مقدار تازه در `PaymentProvider`؛
جای دیگری از کد عوض نمی‌شود.

نکته‌ها:
- مبلغ همه‌جا «ریال» است، همان واحدی که در پایگاه داده ذخیره می‌شود (BIGINT، بدون اعشار).
- شناسه‌ی پذیرنده هرگز لاگ نمی‌شود؛ از خطای درگاه فقط کد وضعیت ثبت می‌گردد.
- `httpx` وابستگی تست است نه اجرا، پس تماس با کتابخانه‌ی استاندارد و در یک thread انجام می‌شود.
"""

import asyncio
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.config import settings
from app.core.errors import ServiceUnavailable

logger = logging.getLogger("partmachine.payment")

GATEWAY_OFF = "پرداخت آنلاین هنوز فعال نشده است."
GATEWAY_FAILED = "ارتباط با درگاه پرداخت برقرار نشد. چند لحظه بعد دوباره تلاش کنید."

# زرین‌پال: ۱۰۰ یعنی انجام شد، ۱۰۱ یعنی قبلاً تأیید شده بود (درخواست تکراری، نه خطا)
ZARINPAL_OK = (100, 101)


@dataclass(frozen=True)
class StartedPayment:
    """پرداخت ساخته شد؛ کاربر باید به `redirect_url` برود."""

    reference: str
    redirect_url: str


@dataclass(frozen=True)
class VerifiedPayment:
    """نتیجه‌ی بررسی پرداخت پس از بازگشت کاربر از درگاه."""

    paid: bool
    tracking_code: str = ""


class PaymentGateway(Protocol):
    enabled: bool

    async def start(
        self, *, amount_rials: int, description: str, callback_url: str, mobile: str | None = None
    ) -> StartedPayment: ...

    async def verify(self, *, reference: str, amount_rials: int) -> VerifiedPayment: ...


class DisabledGateway:
    """پیش‌فرض: درگاهی وصل نیست و هیچ تماسی با بیرون نمی‌رود."""

    enabled = False

    async def start(
        self, *, amount_rials: int, description: str, callback_url: str, mobile: str | None = None
    ) -> StartedPayment:
        raise ServiceUnavailable(GATEWAY_OFF, code="payment_disabled")

    async def verify(self, *, reference: str, amount_rials: int) -> VerifiedPayment:
        raise ServiceUnavailable(GATEWAY_OFF, code="payment_disabled")


def _post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        parsed = json.loads(response.read().decode("utf-8", "replace"))
    return parsed if isinstance(parsed, dict) else {}


class ZarinPalGateway:
    """درگاه زرین‌پال (REST v4). مبلغ به ریال فرستاده می‌شود."""

    enabled = True

    def __init__(self) -> None:
        self._merchant = settings.payment_merchant_id.get_secret_value().strip()
        self._base = settings.payment_base_url.rstrip("/")
        self._timeout = settings.payment_timeout_seconds

    def _call(self, path: str, payload: dict[str, Any], what: str) -> dict[str, Any]:
        try:
            body = _post_json(f"{self._base}{path}", payload, self._timeout)
        except (urllib.error.URLError, OSError, ValueError) as error:
            logger.warning("payment %s failed (%s)", what, type(error).__name__)
            raise ServiceUnavailable(GATEWAY_FAILED, code="payment_failed") from None
        data = body.get("data")
        return data if isinstance(data, dict) else {}

    async def start(
        self, *, amount_rials: int, description: str, callback_url: str, mobile: str | None = None
    ) -> StartedPayment:
        payload: dict[str, Any] = {
            "merchant_id": self._merchant,
            "amount": amount_rials,
            "callback_url": callback_url,
            "description": description,
        }
        if mobile:
            payload["metadata"] = {"mobile": mobile}
        data = await asyncio.to_thread(self._call, "/pg/v4/payment/request.json", payload, "start")
        authority = str(data.get("authority") or "")
        if data.get("code") not in ZARINPAL_OK or not authority:
            logger.warning("payment start refused by the gateway (code %s)", data.get("code"))
            raise ServiceUnavailable(GATEWAY_FAILED, code="payment_failed")
        return StartedPayment(
            reference=authority, redirect_url=f"{self._base}/pg/StartPay/{authority}"
        )

    async def verify(self, *, reference: str, amount_rials: int) -> VerifiedPayment:
        """بررسی نهایی پس از بازگشت کاربر. «پرداخت‌نشده» خطا نیست و `paid=False` برمی‌گرداند."""
        payload = {
            "merchant_id": self._merchant,
            "amount": amount_rials,
            "authority": reference,
        }
        data = await asyncio.to_thread(self._call, "/pg/v4/payment/verify.json", payload, "verify")
        if data.get("code") not in ZARINPAL_OK:
            logger.info("payment not verified (code %s)", data.get("code"))
            return VerifiedPayment(paid=False)
        return VerifiedPayment(paid=True, tracking_code=str(data.get("ref_id") or ""))


_gateway: PaymentGateway | None = None


def get_gateway() -> PaymentGateway:
    global _gateway
    if _gateway is None:
        _gateway = (
            ZarinPalGateway() if settings.payment_gateway == "zarinpal" else DisabledGateway()
        )
    return _gateway


def set_gateway(gateway: PaymentGateway | None) -> None:
    """فقط برای تست: جایگزینی درگاه (None یعنی دوباره از تنظیمات ساخته شود)."""
    global _gateway
    _gateway = gateway
