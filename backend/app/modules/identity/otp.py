"""کد یک‌بارمصرف ۶ رقمی برای بازیابی رمز و تأیید موبایل.

- کد فقط به‌صورت HMAC (با SECRET_KEY) در Redis ذخیره می‌شود و ۱۰ دقیقه اعتبار دارد.
- هر کد حداکثر ۵ بار امتحان می‌شود و پس از استفاده‌ی موفق پاک می‌شود (یک‌بارمصرف، حتی هم‌زمان).
- ارسال دوباره تا ۶۰ ثانیه ممکن نیست؛ سقف ارسال برای هر مقصد و هر IP هم وجود دارد.
- اگر Redis در دسترس نباشد، کد صادر یا پذیرفته نمی‌شود (503).

`subject` چیزی است که کد به آن گره می‌خورد (مثلاً «کاربر + شماره»)؛ `destination` جایی است که کد
فرستاده می‌شود (ایمیل یا شماره).
"""

import hashlib
import hmac
import secrets
from typing import Literal

from redis.exceptions import RedisError

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import ServiceUnavailable, TooManyRequests, field_error
from app.core.messaging import Channel, get_sender
from app.core.redis import get_redis
from app.core.text import fa_digits

Purpose = Literal["password_reset", "phone_verification"]

CODE_TTL_SECONDS = 600
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60

FEATURE_OFF = (
    "ارسال کد هنوز فعال نشده است. برای بازیابی رمز یا تأیید شماره با پشتیبانی پارت‌ماشین "
    "تماس بگیرید."
)
CODE_INVALID = "کد واردشده درست نیست."
CODE_EXPIRED = "کد منقضی شده یا معتبر نیست؛ یک کد تازه بگیرید."
TOO_MANY_WRONG = "کد چند بار اشتباه وارد شد؛ یک کد تازه بگیرید."


def is_enabled() -> bool:
    return get_sender().enabled


def _key(purpose: Purpose, subject: str) -> str:
    digest = hashlib.sha256(f"{purpose}:{subject}".encode()).hexdigest()[:32]
    return f"otp:{digest}"


def _digest(purpose: Purpose, subject: str, code: str) -> str:
    message = f"{purpose}:{subject}:{code}".encode()
    return hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()


def _unavailable() -> ServiceUnavailable:
    return ServiceUnavailable("سرویس موقتاً در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.")


async def throttle(*, purpose: Purpose, subject: str, destination: str, ip: str) -> None:
    """فاصله‌ی ارسال دوباره و سقف‌ها؛ برای مقصد ناموجود هم اجرا می‌شود تا پاسخ‌ها یکسان بمانند."""
    if not is_enabled():
        raise ServiceUnavailable(FEATURE_OFF, code="otp_disabled")
    await rate_limit.hit(rate_limit.OTP_SEND_PER_IP, ip)
    cooldown = f"{_key(purpose, subject)}:cooldown"
    try:
        fresh = await get_redis().set(cooldown, "1", ex=RESEND_COOLDOWN_SECONDS, nx=True)
        wait = 0 if fresh else await get_redis().ttl(cooldown)
    except RedisError:
        raise _unavailable() from None
    if not fresh:
        seconds = max(int(wait), 1)
        raise TooManyRequests(
            f"کد قبلی همین حالا فرستاده شد. {fa_digits(seconds)} ثانیه‌ی دیگر دوباره امتحان کنید.",
            code="otp_cooldown",
            headers={"Retry-After": str(seconds)},
        )
    # سقف برای خود مقصد: یک شماره یا ایمیل را نمی‌توان از چند حساب بمباران کرد
    await rate_limit.hit(rate_limit.OTP_SEND_PER_DESTINATION, destination)


async def issue(*, purpose: Purpose, subject: str, channel: Channel, destination: str) -> None:
    """کد تازه می‌سازد (کد قبلی همان موضوع باطل می‌شود) و می‌فرستد."""
    code = f"{secrets.randbelow(10**6):06d}"
    key = _key(purpose, subject)
    try:
        async with get_redis().pipeline(transaction=True) as pipe:
            pipe.set(key, _digest(purpose, subject, code), ex=CODE_TTL_SECONDS)
            pipe.delete(f"{key}:attempts")
            await pipe.execute()
    except RedisError:
        raise _unavailable() from None
    await get_sender().send(channel=channel, destination=destination, code=code, purpose=purpose)


async def consume(*, purpose: Purpose, subject: str, code: str) -> None:
    """کد را بررسی و مصرف می‌کند؛ در غیر این صورت خطای فیلد `code` (422) می‌دهد."""
    key = _key(purpose, subject)
    attempts_key = f"{key}:attempts"
    try:
        redis = get_redis()
        stored = await redis.get(key)
        if stored is None:
            raise field_error("code", CODE_EXPIRED)
        attempts = await redis.incr(attempts_key)
        await redis.expire(attempts_key, CODE_TTL_SECONDS)
        if attempts > MAX_ATTEMPTS:
            await redis.delete(key, attempts_key)
            raise field_error("code", TOO_MANY_WRONG)
        if not hmac.compare_digest(str(stored), _digest(purpose, subject, code)):
            if attempts == MAX_ATTEMPTS:
                await redis.delete(key, attempts_key)
                raise field_error("code", TOO_MANY_WRONG)
            raise field_error("code", CODE_INVALID)
        # فقط یک درخواست می‌تواند کد را پاک کند؛ درخواست هم‌زمان دوم «منقضی» می‌گیرد
        if not await redis.delete(key):
            raise field_error("code", CODE_EXPIRED)
        await redis.delete(attempts_key)
    except RedisError:
        raise _unavailable() from None
