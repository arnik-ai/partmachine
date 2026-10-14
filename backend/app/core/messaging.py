"""ارسال کد یک‌بارمصرف از طریق یک رابط عمومی (P8).

- `ConsoleSender`: فقط توسعه و تست؛ کد در لاگ نوشته می‌شود و تست‌ها آن را از `outbox` می‌خوانند.
- `DisabledSender`: پیش‌فرض staging/production تا سرویس پیامک یا ایمیل واقعی انتخاب و تأیید شود.

اتصال به سرویس واقعی (پولی) یعنی یک پیاده‌سازی دیگر از همین رابط؛ هیچ جای دیگری از کد عوض نمی‌شود.
"""

import logging
from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import settings

logger = logging.getLogger("partmachine.messaging")

Channel = Literal["email", "sms"]
OUTBOX_SIZE = 50


@dataclass(frozen=True)
class SentCode:
    channel: Channel
    destination: str
    code: str
    purpose: str


class CodeSender(Protocol):
    enabled: bool

    async def send(
        self, *, channel: Channel, destination: str, code: str, purpose: str
    ) -> None: ...


def mask(destination: str) -> str:
    """فقط برای لاگ: بخش بزرگی از ایمیل یا شماره پنهان می‌شود."""
    if "@" in destination:
        name, _, domain = destination.partition("@")
        return f"{name[:2]}***@{domain}"
    return f"{destination[:5]}***{destination[-2:]}"


class ConsoleSender:
    enabled = True

    def __init__(self) -> None:
        self.outbox: list[SentCode] = []

    async def send(self, *, channel: Channel, destination: str, code: str, purpose: str) -> None:
        # فقط development/test (Settings.problems در محیط‌های دیگر جلوی آن را می‌گیرد)
        logger.info(
            "one-time code (%s via %s to %s): %s", purpose, channel, mask(destination), code
        )
        self.outbox.append(SentCode(channel, destination, code, purpose))
        del self.outbox[:-OUTBOX_SIZE]


class DisabledSender:
    enabled = False

    async def send(self, *, channel: Channel, destination: str, code: str, purpose: str) -> None:
        raise RuntimeError("code sending is disabled")  # فراخواننده پیش از ارسال enabled را می‌بیند


_sender: CodeSender | None = None


def get_sender() -> CodeSender:
    global _sender
    if _sender is None:
        _sender = ConsoleSender() if settings.otp_sender_name == "console" else DisabledSender()
    return _sender


def set_sender(sender: CodeSender | None) -> None:
    """فقط برای تست: جایگزینی ارسال‌کننده (None یعنی دوباره از تنظیمات ساخته شود)."""
    global _sender
    _sender = sender
