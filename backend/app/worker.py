"""کارهای پس‌زمینه‌ی پارت‌ماشین (گام 4d فاز ۴).

    python -m app.worker                          # اجرای دائمی (در تولید: سرویس worker در compose)
    python -m app.worker --run delivery_reminders # اجرای فوری یک کار و چاپ نتیجه

کارها و فاصله‌ی اجرای آن‌ها در `JOBS` آمده است. هر کار:
- تکرارپذیر است و اجرای دوباره‌اش چیزی را دو بار انجام نمی‌دهد؛
- با قفل Redis هم‌زمان فقط در یک worker اجرا می‌شود، پس اجرای چند worker بی‌خطر است؛
- سقف زمان دارد. اگر شکست بخورد، پس از ۱، ۵ و ۱۵ دقیقه دوباره امتحان می‌شود و بعد به برنامه‌ی
  عادی خود برمی‌گردد؛
- نتیجه و آخرین خطایش در لاگ و در Redis (`pm:job:<name>`) ثبت می‌شود تا پایش آن را ببیند.

چرا arq نه: arq و saq فقط با نسخه‌های قدیمی redis-py کار می‌کنند. این کارها همه زمان‌بندی‌شده‌اند و
این حلقه‌ی کوچک، بدون وابستگی تازه، همان قواعد را برآورده می‌کند.
"""

import argparse
import asyncio
import contextlib
import json
import logging
import signal
import sys
import tempfile
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from redis.asyncio import Redis

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.redis import close_redis, get_redis
from app.core.time import business_today, utcnow
from app.db.session import SessionLocal, engine
from app.modules.files import cleanup as file_cleanup
from app.modules.notifications import service as notifications
from app.modules.orders import reminders
from app.modules.outbox import service as outbox

logger = logging.getLogger("partmachine.worker")

TICK_SECONDS = 15
# healthcheck کانتینر: اگر این فایل در دو دقیقه‌ی اخیر به‌روز نشده باشد، worker گیر کرده است
HEARTBEAT_FILE = Path(tempfile.gettempdir()) / "pm-worker-heartbeat"
RETRY_DELAYS = (60, 300, 900)
# آزادسازی قفل فقط اگر هنوز مال همین اجرا باشد
RELEASE_LOCK = (
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0"
)

JobResult = dict[str, int]


@dataclass(frozen=True)
class Job:
    name: str
    every: timedelta
    run: Callable[[], Awaitable[JobResult]]
    timeout: timedelta = timedelta(minutes=5)

    @property
    def key(self) -> str:
        return f"pm:job:{self.name}"


async def delivery_reminders() -> JobResult:
    async with SessionLocal() as db:
        return await reminders.send_delivery_reminders(db, today=business_today())


async def expired_uploads() -> JobResult:
    async with SessionLocal() as db:
        return await file_cleanup.delete_unattached_uploads(db, now=utcnow())


async def old_notifications() -> JobResult:
    async with SessionLocal() as db:
        return {"deleted": await notifications.delete_old_read(db, now=utcnow())}


async def send_messages() -> JobResult:
    return await outbox.send_due()


JOBS = (
    Job("delivery_reminders", timedelta(hours=1), delivery_reminders),
    Job("expired_uploads", timedelta(hours=6), expired_uploads),
    Job("old_notifications", timedelta(days=1), old_notifications),
    Job("outbox", timedelta(seconds=30), send_messages, timeout=timedelta(minutes=2)),
)


async def run_job(redis: Redis, job: Job, now: float, *, force: bool = False) -> JobResult | None:
    """کار را اگر سررسیده باشد (یا force) و worker دیگری اجرایش نکند، اجرا می‌کند.

    None یعنی اجرا نشد؛ شکست کار خطا بالا نمی‌دهد و فقط ثبت می‌شود.
    """
    lock = f"{job.key}:lock"
    token = uuid.uuid4().hex
    lock_ms = int((job.timeout.total_seconds() + 60) * 1000)
    if not force and float(await redis.hget(job.key, "next_run") or 0) > now:
        return None
    if not await redis.set(lock, token, nx=True, px=lock_ms):
        return None
    try:
        # client با decode_responses ساخته شده است، پس کلید و مقدار رشته‌اند
        state = {str(k): str(v) for k, v in (await redis.hgetall(job.key)).items()}
        # worker دیگری ممکن است همین حالا کار را تمام کرده باشد
        if not force and float(state.get("next_run", 0)) > now:
            return None
        return await _execute(redis, job, state, now)
    finally:
        await redis.eval(RELEASE_LOCK, 1, lock, token)


async def _execute(redis: Redis, job: Job, state: dict[str, str], now: float) -> JobResult | None:
    started = time.monotonic()
    try:
        async with asyncio.timeout(job.timeout.total_seconds()):
            result = await job.run()
    except Exception as exc:
        failures = int(state.get("failures", 0)) + 1
        delay = (
            RETRY_DELAYS[failures - 1]
            if failures <= len(RETRY_DELAYS)
            else job.every.total_seconds()
        )
        error = f"{type(exc).__name__}: {exc}"[:300]
        await redis.hset(
            job.key,
            mapping={
                "next_run": now + delay,
                "last_status": "failed",
                "last_error": error,
                "failures": failures,
                "last_finished": time.time(),
            },
        )
        logger.error(
            "job %s failed (%s in a row), next try in %ss: %s",
            job.name,
            failures,
            int(delay),
            error,
            exc_info=exc,
            extra={"job": job.name, "failures": failures},
        )
        return None
    duration_ms = int((time.monotonic() - started) * 1000)
    await redis.hset(
        job.key,
        mapping={
            "next_run": now + job.every.total_seconds(),
            "last_status": "ok",
            "last_error": "",
            "failures": 0,
            "last_finished": time.time(),
            "last_result": json.dumps(result),
        },
    )
    logger.info(
        "job %s finished in %sms: %s",
        job.name,
        duration_ms,
        result,
        extra={"job": job.name, "result": result, "duration_ms": duration_ms},
    )
    return result


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), seconds)


async def _job_loop(redis: Redis, job: Job, stop: asyncio.Event) -> None:
    # هر کار حلقه‌ی خودش را دارد تا کار طولانی، کارهای کوتاه (مثل صف ارسال) را معطل نکند
    while not stop.is_set():
        try:
            await run_job(redis, job, time.time())
        except Exception:
            # مثلاً Redis یا پایگاه داده موقتاً در دسترس نیست؛ در دور بعد دوباره
            logger.exception("worker could not check job %s", job.name)
        await _wait(stop, TICK_SECONDS)


async def _heartbeat_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        await asyncio.to_thread(HEARTBEAT_FILE.touch)
        await _wait(stop, TICK_SECONDS)


async def run_forever(stop: asyncio.Event) -> None:
    redis = get_redis()
    logger.info("worker started: %s", ", ".join(job.name for job in JOBS))
    await asyncio.gather(_heartbeat_loop(stop), *(_job_loop(redis, job, stop) for job in JOBS))
    logger.info("worker stopped")


async def _main(args: argparse.Namespace) -> int:
    try:
        if args.run:
            job = next(job for job in JOBS if job.name == args.run)
            result = await run_job(get_redis(), job, time.time(), force=True)
            if result is None:
                print("اجرا نشد: کار شکست خورد یا worker دیگری همین حالا آن را اجرا می‌کند.")
                return 1
            print(json.dumps(result, ensure_ascii=False))
            return 0
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for signum in (signal.SIGTERM, signal.SIGINT):
            # ویندوز add_signal_handler ندارد؛ آن‌جا Ctrl+C همان KeyboardInterrupt است
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(signum, stop.set)
        await run_forever(stop)
        return 0
    finally:
        await engine.dispose()
        await close_redis()


def main() -> None:
    # خروجی فارسی در ترمینال یا pipe با کدگذاری غیر UTF-8 نباید برنامه را بشکند
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="کارهای پس‌زمینه‌ی پارت‌ماشین")
    parser.add_argument(
        "--run", choices=[job.name for job in JOBS], help="اجرای فوری یک کار و چاپ نتیجه"
    )
    args = parser.parse_args()
    problems = settings.problems()
    if problems:
        raise SystemExit("Unsafe configuration:\n- " + "\n- ".join(problems))
    configure_logging(settings)
    with contextlib.suppress(KeyboardInterrupt):
        raise SystemExit(asyncio.run(_main(args)))


if __name__ == "__main__":
    main()
