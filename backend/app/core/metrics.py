"""آمار درخواست‌ها برای پایش (گام 4e): تعداد، خطا و زمان پاسخ هر مسیر، به‌علاوه‌ی وضعیت worker.

آمار در Redis نگه داشته می‌شود تا شمارش همه‌ی پروسه‌ها و همه‌ی نسخه‌های API یک‌جا باشد.
`GET /metrics` همه را در قالب Prometheus برمی‌گرداند. این مسیر فقط از داخل سرور در دسترس است، چون
Caddy فقط `/api/*` را به API می‌فرستد.

ثبت آمار هرگز درخواست را کند یا خراب نمی‌کند: کار در پس‌زمینه انجام می‌شود و اگر Redis در دسترس
نباشد، همان درخواست شمرده نمی‌شود. مسیرها با الگوی خود (مثلاً `/api/v1/rfqs/{rfq_id}`) شمرده
می‌شوند و مسیر ناشناخته `unmatched` است، تا تعداد برچسب‌ها محدود بماند.
"""

import asyncio
import time

from app.core.health import components
from app.core.redis import get_redis

REQUESTS_KEY = "pm:metrics:requests"
DURATION_KEY = "pm:metrics:duration"
HEARTBEAT_KEY = "pm:worker:heartbeat"
JOB_PREFIX = "pm:job:"
# مرز سطل‌های زمان پاسخ به ثانیه
BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
DURATION = "partmachine_http_request_duration_seconds"

_pending: set[asyncio.Task[None]] = set()


def observe(method: str, route: str, status: int, seconds: float) -> None:
    """یک درخواست را در پس‌زمینه می‌شمارد (بدون منتظر نگه داشتن پاسخ)."""
    task = asyncio.get_running_loop().create_task(_record(method, route, status, seconds))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def flush() -> None:
    """منتظر شمارش‌های در جریان می‌ماند (برای تست)."""
    await asyncio.gather(*_pending, return_exceptions=True)


async def _record(method: str, route: str, status: int, seconds: float) -> None:
    label = f"{method} {route}"
    try:
        pipe = get_redis().pipeline(transaction=False)
        pipe.hincrby(REQUESTS_KEY, f"{label} {status}", 1)
        for bound in BUCKETS:
            if seconds <= bound:
                pipe.hincrby(DURATION_KEY, f"{label} {bound}", 1)
        pipe.hincrby(DURATION_KEY, f"{label} count", 1)
        pipe.hincrbyfloat(DURATION_KEY, f"{label} sum", seconds)
        await pipe.execute()
    except Exception:
        return


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _labels(**values: str) -> str:
    return "{" + ",".join(f'{name}="{_escape(value)}"' for name, value in values.items()) + "}"


def _family(name: str, kind: str, help_text: str) -> list[str]:
    return [f"# HELP {name} {help_text}", f"# TYPE {name} {kind}"]


async def render() -> str:
    """همه‌ی آمار در قالب متنی Prometheus؛ نمونه‌های هر خانواده یک‌جا می‌آیند."""
    redis = get_redis()
    # client با decode_responses ساخته شده است، پس کلید و مقدار رشته‌اند
    requests = {str(k): str(v) for k, v in (await redis.hgetall(REQUESTS_KEY)).items()}
    durations = {str(k): str(v) for k, v in (await redis.hgetall(DURATION_KEY)).items()}

    lines = _family(
        "partmachine_http_requests_total", "counter", "HTTP requests by route and status code."
    )
    for field, value in sorted(requests.items()):
        method, route, status = str(field).split(" ", 2)
        labels = _labels(method=method, route=route, status=status)
        lines.append(f"partmachine_http_requests_total{labels} {value}")

    grouped: dict[str, dict[str, str]] = {}
    for field, value in durations.items():
        label, _, part = str(field).rpartition(" ")
        grouped.setdefault(label, {})[part] = str(value)
    lines += _family(DURATION, "histogram", "HTTP response time by route.")
    for label in sorted(grouped):
        method, route = label.split(" ", 1)
        values = grouped[label]
        for bound in BUCKETS:
            labels = _labels(method=method, route=route, le=str(bound))
            lines.append(f"{DURATION}_bucket{labels} {values.get(str(bound), '0')}")
        count = values.get("count", "0")
        lines.append(f"{DURATION}_bucket{_labels(method=method, route=route, le='+Inf')} {count}")
        lines.append(
            f"{DURATION}_sum{_labels(method=method, route=route)} {values.get('sum', '0')}"
        )
        lines.append(f"{DURATION}_count{_labels(method=method, route=route)} {count}")

    lines += _family("partmachine_up", "gauge", "Whether a component answers (1) or not (0).")
    for component, ok in (await components()).items():
        lines.append(f"partmachine_up{_labels(component=component)} {int(ok)}")

    heartbeat = await redis.get(HEARTBEAT_KEY)
    age = time.time() - float(heartbeat) if heartbeat else -1
    lines += _family(
        "partmachine_worker_heartbeat_age_seconds",
        "gauge",
        "Seconds since the worker last checked in (-1 if never).",
    )
    lines.append(f"partmachine_worker_heartbeat_age_seconds {age:.0f}")

    jobs: dict[str, dict[str, str]] = {}
    async for key in redis.scan_iter(match=f"{JOB_PREFIX}*"):
        name = str(key).removeprefix(JOB_PREFIX)
        if not name.endswith(":lock"):
            jobs[name] = {str(k): str(v) for k, v in (await redis.hgetall(key)).items()}
    lines += _family(
        "partmachine_job_last_finished_timestamp_seconds", "gauge", "When each job last ran."
    )
    for name in sorted(jobs):
        stamp = jobs[name].get("last_finished", "0")
        lines.append(f"partmachine_job_last_finished_timestamp_seconds{_labels(job=name)} {stamp}")
    lines += _family(
        "partmachine_job_consecutive_failures", "gauge", "Failures in a row for each job."
    )
    for name in sorted(jobs):
        failures = jobs[name].get("failures", "0")
        lines.append(f"partmachine_job_consecutive_failures{_labels(job=name)} {failures}")
    return "\n".join(lines) + "\n"
