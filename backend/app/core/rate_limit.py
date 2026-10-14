"""محدودیت نرخ توزیع‌شده (پنجره‌ی ثابت در Redis) — بین چند instance مشترک است.

کلیدها هش می‌شوند تا ایمیل یا IP خام در Redis نماند. اگر Redis در دسترس نباشد:
در development/test درخواست با هشدار ادامه می‌یابد؛ در staging/production رد می‌شود
(قابل تغییر با RATE_LIMIT_FAIL_OPEN).
"""

import hashlib
import logging
import math
from dataclasses import dataclass

from redis.exceptions import RedisError

from app.core.config import settings
from app.core.errors import ServiceUnavailable, TooManyRequests
from app.core.redis import get_redis
from app.core.text import fa_digits

logger = logging.getLogger("partmachine.rate_limit")


@dataclass(frozen=True)
class Limit:
    name: str
    max_hits: int
    window_seconds: int


LOGIN_PER_IP = Limit("login-ip", 30, 300)
LOGIN_FAILURES_PER_EMAIL = Limit("login-fail-email", 8, 900)
# کارمندان یک شرکت اغلب پشت یک IP هستند (مثلاً هنگام عضویت با لینک دعوت)؛ سقف برای جلوگیری از
# ثبت‌نام خودکار است، نه برای محدود کردن ثبت‌نام جمعی همکاران
REGISTER_PER_IP = Limit("register-ip", 30, 3600)
REFRESH_PER_IP = Limit("refresh-ip", 120, 300)
UPLOADS_PER_USER = Limit("upload-user", 120, 3600)
PASSWORD_CHANGE_FAILURES_PER_USER = Limit("password-change-fail-user", 8, 900)
# کد یک‌بارمصرف: ارسال (هزینه‌ی پیامک و مزاحمت) و حدس زدن کد
OTP_SEND_PER_IP = Limit("otp-send-ip", 20, 3600)
OTP_SEND_PER_DESTINATION = Limit("otp-send-destination", 5, 3600)
OTP_VERIFY_PER_IP = Limit("otp-verify-ip", 60, 3600)


def _key(limit: Limit, subject: str) -> str:
    digest = hashlib.sha256(subject.encode()).hexdigest()[:32]
    return f"rl:{limit.name}:{digest}"


def _too_many(ttl: int) -> TooManyRequests:
    wait = max(int(ttl), 1)
    minutes = math.ceil(wait / 60)
    return TooManyRequests(
        f"تعداد تلاش‌ها زیاد بوده است. لطفاً {fa_digits(minutes)} دقیقه‌ی دیگر دوباره تلاش کنید.",
        headers={"Retry-After": str(wait)},
    )


def _unavailable() -> ServiceUnavailable:
    return ServiceUnavailable("سرویس موقتاً در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.")


async def hit(limit: Limit, subject: str) -> None:
    """یک تلاش ثبت می‌کند و اگر از سقف گذشته باشد 429 می‌دهد."""
    if not settings.rate_limit_enabled:
        return
    key = _key(limit, subject)
    try:
        async with get_redis().pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, limit.window_seconds, nx=True)
            pipe.ttl(key)
            count, _, ttl = await pipe.execute()
    except RedisError:
        logger.warning("rate limiter unavailable (limit=%s)", limit.name)
        if settings.rate_limit_should_fail_open:
            return
        raise _unavailable() from None
    if int(count) > limit.max_hits:
        raise _too_many(int(ttl))


async def ensure_below(limit: Limit, subject: str) -> None:
    """بدون ثبت تلاش، فقط بررسی می‌کند که سقف پر نشده باشد (برای شمارنده‌ی ورود ناموفق)."""
    if not settings.rate_limit_enabled:
        return
    key = _key(limit, subject)
    try:
        redis = get_redis()
        count = await redis.get(key)
        if count is not None and int(count) >= limit.max_hits:
            raise _too_many(int(await redis.ttl(key)))
    except RedisError:
        logger.warning("rate limiter unavailable (limit=%s)", limit.name)
        if not settings.rate_limit_should_fail_open:
            raise _unavailable() from None


async def record(limit: Limit, subject: str) -> None:
    """یک رویداد (مثلاً ورود ناموفق) را بدون بررسی سقف می‌شمارد."""
    if not settings.rate_limit_enabled:
        return
    key = _key(limit, subject)
    try:
        async with get_redis().pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, limit.window_seconds, nx=True)
            await pipe.execute()
    except RedisError:
        logger.warning("rate limiter unavailable (limit=%s)", limit.name)


async def reset(limit: Limit, subject: str) -> None:
    if not settings.rate_limit_enabled:
        return
    try:
        await get_redis().delete(_key(limit, subject))
    except RedisError:
        logger.warning("rate limiter unavailable (limit=%s)", limit.name)
