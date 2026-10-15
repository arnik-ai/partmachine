"""هشدار ساده‌ی «سایت پایین است» (گام 4e): worker هر دقیقه سایت و API را از داخل سرور می‌آزماید.

اگر دو بار پشت سر هم (حدود دو دقیقه) پاسخ درست نیاید، به همه‌ی ادمین‌ها اعلان «سایت از دسترس خارج
شده است» می‌رسد و با برگشتن سایت، اعلان «دوباره در دسترس است». در فاصله‌ی این دو، هشدار تکراری
نمی‌آید. اگر ارسال ایمیل روشن باشد (S9)، همین اعلان‌ها ایمیل هم می‌شوند. اگر خود پایگاه داده پایین
باشد، اعلان ثبت نمی‌شود و فقط خطا در لاگ می‌ماند.

خاموش شدن کامل سرور را چیزی روی همان سرور نمی‌تواند خبر بدهد. برای آن یک سرویس پایش بیرونی را روی
`/api/v1/status` تنظیم کنید (deploy/README.md).

همین کار پشتیبان‌گیری را هم می‌پاید: اگر بیش از `BACKUP_MAX_AGE` پشتیبان موفقی ثبت نشده باشد (سرویس
backup آن را در Redis می‌نویسد)، یک بار به ادمین‌ها اعلان می‌دهد.
"""

import asyncio
import logging
import time
import urllib.error
import urllib.request

from app.core.config import settings
from app.core.redis import get_redis
from app.core.text import fa_digits
from app.db.session import SessionLocal
from app.modules.notifications import service as notifications

logger = logging.getLogger("partmachine.health")

STATE_KEY = "pm:health:state"
BACKUP_KEY = "pm:backup:last_success"
BACKUP_MISSING_KEY = "pm:health:backup_missing_since"
BACKUP_ALERT_KEY = "pm:health:backup_alerted"
# پشتیبان روزانه است؛ دو ساعت فرصت برای پشتیبان طولانی
BACKUP_MAX_AGE = 26 * 3600
FAILURES_TO_ALERT = 2
TIMEOUT_SECONDS = 10


def probe(url: str) -> bool:
    """True اگر آدرس با کد ۲xx یا ۳xx پاسخ دهد."""
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            return 200 <= response.status < 400
    except (urllib.error.URLError, OSError, ValueError):
        return False


def targets() -> dict[str, str]:
    return {
        "API": f"{settings.api_internal_url.rstrip('/')}/ready",
        "سایت": settings.site_url,
    }


async def failing_targets() -> list[str]:
    checks = targets()
    results = await asyncio.gather(*(asyncio.to_thread(probe, url) for url in checks.values()))
    return [name for name, ok in zip(checks, results, strict=True) if not ok]


async def _notify_admins(title: str, body: str) -> None:
    try:
        async with SessionLocal() as db:
            await notifications.notify_admins(
                db, kind="system_health", title=title, body=body, link="/admin"
            )
            await db.commit()
    except Exception:
        logger.exception("could not notify admins about site health")


async def update(failing: list[str]) -> dict[str, int]:
    """وضعیت تازه را ثبت می‌کند و فقط هنگام تغییر وضعیت (پایین رفتن یا برگشتن) اعلان می‌دهد."""
    redis = get_redis()
    state = {str(k): str(v) for k, v in (await redis.hgetall(STATE_KEY)).items()}
    down = state.get("status") == "down"
    failures = int(state.get("failures", 0))
    if failing:
        failures += 1
        what = "، ".join(failing)
        if not down and failures >= FAILURES_TO_ALERT:
            await redis.hset(
                STATE_KEY, mapping={"status": "down", "failures": failures, "since": time.time()}
            )
            logger.error("ALERT site is down: %s did not answer twice in a row", ", ".join(failing))
            await _notify_admins(
                "هشدار: سایت از دسترس خارج شده است",
                f"بررسی خودکار دو بار پشت سر هم به {what} نرسید. گزارش‌های سرور را بررسی کنید.",
            )
            return {"failing": len(failing), "alerted": 1}
        await redis.hset(STATE_KEY, mapping={"failures": failures})
        return {"failing": len(failing), "alerted": 0}
    if down:
        minutes = max(1, round((time.time() - float(state.get("since", time.time()))) / 60))
        await redis.delete(STATE_KEY)
        logger.warning("site is back after about %s minutes", minutes)
        await _notify_admins(
            "سایت دوباره در دسترس است",
            f"پس از حدود {fa_digits(minutes)} دقیقه، سایت و API دوباره پاسخ می‌دهند.",
        )
        return {"failing": 0, "recovered": 1}
    if failures:
        await redis.delete(STATE_KEY)
    return {"failing": 0}


async def check_backup() -> bool:
    """True اگر همین حالا هشدار «پشتیبان‌گیری انجام نشده» داده شد (برای هر دوره‌ی خرابی یک بار)."""
    redis = get_redis()
    now = time.time()
    last = await redis.get(BACKUP_KEY)
    if last is None:
        # نصب تازه: سرویس backup چند دقیقه بعد نخستین پشتیبان را می‌گیرد؛ تا یک روز صبر
        await redis.set(BACKUP_MISSING_KEY, now, nx=True)
        since = float(await redis.get(BACKUP_MISSING_KEY) or now)
    else:
        await redis.delete(BACKUP_MISSING_KEY)
        since = float(last)
    if now - since <= BACKUP_MAX_AGE:
        await redis.delete(BACKUP_ALERT_KEY)
        return False
    if not await redis.set(BACKUP_ALERT_KEY, "1", nx=True):
        return False
    logger.error("ALERT no successful backup for over %s hours", BACKUP_MAX_AGE // 3600)
    hours = int((now - since) // 3600)
    await _notify_admins(
        "هشدار: بیش از یک روز است پشتیبان‌گیری انجام نشده",
        f"آخرین پشتیبان موفق {fa_digits(hours)} ساعت پیش بوده است. گزارش سرویس backup را بررسی کنید"
        " (docs/BACKUP_RESTORE.md).",
    )
    return True


async def run() -> dict[str, int]:
    """کار worker؛ فقط در staging و production (یا با HEALTH_WATCH_ENABLED=true)."""
    if not settings.watch_health:
        return {"skipped": 1}
    result = await update(await failing_targets())
    if await check_backup():
        result["backup_alerted"] = 1
    return result
