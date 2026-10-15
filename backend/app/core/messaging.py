"""ارسال ایمیل و پیامک از طریق دو رابط عمومی (P8، S9).

- `CodeSender`: کد یک‌بارمصرف، همان لحظه و بدون صف.
- `MessageSender`: پیام اعلان‌ها، که worker از صف ارسال (`outbox_messages`) می‌فرستد.

هر کدام دو پیاده‌سازی دارد:
- console: فقط توسعه و تست؛ پیام در لاگ نوشته می‌شود و تست‌ها آن را از `outbox` می‌خوانند.
- disabled: پیش‌فرض staging/production تا سرویس پیامک یا ایمیل واقعی انتخاب و تأیید شود.

اتصال به سرویس واقعی (پولی) یعنی یک پیاده‌سازی دیگر از همین رابط‌ها؛ هیچ جای دیگری از کد عوض نمی‌شود.
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


@dataclass(frozen=True)
class SentMessage:
    channel: Channel
    destination: str
    subject: str
    body: str


class MessageSender(Protocol):
    enabled: bool

    async def send_message(
        self, *, channel: Channel, destination: str, subject: str, body: str
    ) -> None: ...


class ConsoleMessageSender:
    enabled = True

    def __init__(self) -> None:
        self.outbox: list[SentMessage] = []

    async def send_message(
        self, *, channel: Channel, destination: str, subject: str, body: str
    ) -> None:
        # فقط development/test (Settings.problems در محیط‌های دیگر جلوی آن را می‌گیرد)
        logger.info("message (%s to %s): %s", channel, mask(destination), subject)
        self.outbox.append(SentMessage(channel, destination, subject, body))
        del self.outbox[:-OUTBOX_SIZE]


class DisabledMessageSender:
    enabled = False

    async def send_message(
        self, *, channel: Channel, destination: str, subject: str, body: str
    ) -> None:
        raise RuntimeError("message sending is disabled")  # وقتی خاموش است چیزی در صف نیست


_message_sender: MessageSender | None = None


def get_message_sender() -> MessageSender:
    global _message_sender
    if _message_sender is None:
        _message_sender = (
            ConsoleMessageSender()
            if settings.message_sender_name == "console"
            else DisabledMessageSender()
        )
    return _message_sender


def set_message_sender(sender: MessageSender | None) -> None:
    """فقط برای تست: جایگزینی ارسال‌کننده‌ی پیام (None یعنی دوباره از تنظیمات ساخته شود)."""
    global _message_sender
    _message_sender = sender
