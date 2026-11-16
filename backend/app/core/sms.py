"""اتصال به سرویس پیامک (P8).

تا وقتی کلید سرویس در تنظیمات نیست، ارسال‌کننده‌ی «disabled» کار می‌کند و هیچ پیامکی نمی‌رود.
با گذاشتن `OTP_SENDER=kavenegar` و کلید، همین کلاس جای آن را می‌گیرد و هیچ جای دیگری از کد
عوض نمی‌شود (رابط `CodeSender` در `app/core/messaging.py`).

افزودن سرویس دیگر (ملی‌پیامک، اس‌ام‌اس‌دات‌آی‌آر و…) یعنی یک کلاس تازه در همین فایل و یک مقدار
تازه در `OtpSender`؛ نه `otp.py` عوض می‌شود و نه مسیرها.

دو نکته:

- کلید API کاوه‌نگار داخل مسیر URL است، پس هیچ URL و هیچ متن خطایی از سرویس لاگ نمی‌شود؛
  فقط نوع خطا و کد وضعیت ثبت می‌گردد.
- `httpx` فقط وابستگی تست است، پس تماس با کتابخانه‌ی استاندارد و در یک thread انجام می‌شود
  (همان کاری که `health_watch.py` می‌کند).
"""

import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import settings
from app.core.errors import ServiceUnavailable
from app.core.messaging import Channel

logger = logging.getLogger("partmachine.sms")

SEND_FAILED = "ارسال پیامک انجام نشد. چند لحظه بعد دوباره تلاش کنید."


def local_number(phone: str) -> str:
    """«+989121234567» ⇒ «09121234567» — قالبی که سرویس‌های پیامک ایرانی می‌خواهند."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 12 and digits.startswith("98"):
        digits = digits[2:]
    return digits if digits.startswith("0") else f"0{digits}"


def _post(url: str, fields: dict[str, str], timeout: float) -> dict[str, Any]:
    body = urllib.parse.urlencode(fields).encode()
    request = urllib.request.Request(url, data=body, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        parsed = json.loads(response.read().decode("utf-8", "replace"))
    return parsed if isinstance(parsed, dict) else {}


class KavenegarSms:
    """تماس با API کاوه‌نگار؛ هر خطا به «سرویس در دسترس نیست» تبدیل می‌شود."""

    def __init__(self) -> None:
        self._key = settings.sms_api_key.get_secret_value().strip()
        self._base = settings.sms_base_url.rstrip("/")
        self._timeout = settings.sms_timeout_seconds

    def _url(self, path: str) -> str:
        return f"{self._base}/{urllib.parse.quote(self._key, safe='')}/{path}"

    def _call(self, path: str, fields: dict[str, str], what: str) -> None:
        try:
            body = _post(self._url(path), fields, self._timeout)
        except (urllib.error.URLError, OSError, ValueError) as error:
            logger.warning("sms %s failed (%s)", what, type(error).__name__)
            raise ServiceUnavailable(SEND_FAILED, code="sms_failed") from None
        status = body.get("return", {}).get("status") if isinstance(body, dict) else None
        if status != 200:
            # متن خطای سرویس ممکن است بخشی از درخواست (و کلید) را بازتاب دهد؛ فقط وضعیت ثبت می‌شود
            logger.warning("sms %s refused by the provider (status %s)", what, status)
            raise ServiceUnavailable(SEND_FAILED, code="sms_failed")

    async def send_code(self, destination: str, code: str, purpose: str) -> None:
        """کد یک‌بارمصرف با الگوی تأییدشده‌ی سرویس (خط خدماتی، نه پیامک تبلیغاتی)."""
        await asyncio.to_thread(
            self._call,
            "verify/lookup.json",
            {
                "receptor": local_number(destination),
                "token": code,
                "template": settings.sms_otp_template,
            },
            f"code:{purpose}",
        )


class SmsCodeSender:
    """`CodeSender` روی سرویس پیامک. فقط کانال پیامک؛ سرویس ایمیل هنوز انتخاب نشده است."""

    enabled = True
    channels: frozenset[Channel] = frozenset({"sms"})

    def __init__(self) -> None:
        self._sms = KavenegarSms()

    async def send(self, *, channel: Channel, destination: str, code: str, purpose: str) -> None:
        if channel not in self.channels:
            # فراخواننده پیش از ارسال پشتیبانی کانال را می‌بیند؛ این‌جا فقط محافظ است
            raise ServiceUnavailable("سرویس ایمیل هنوز متصل نشده است.", code="channel_unavailable")
        await self._sms.send_code(destination, code, purpose)
