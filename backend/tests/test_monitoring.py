"""پایش (گام 4e فاز ۴): آمار Prometheus، وضعیت عمومی برای سرویس‌های بیرونی، و هشدار «سایت پایین است»
که فقط هنگام تغییر وضعیت به ادمین‌ها اعلان می‌دهد."""

import re
import time
from collections.abc import Callable
from urllib.parse import urlsplit

import httpx
import pytest
from sqlalchemy import text
from starlette.applications import Starlette
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app import health_watch
from app.core import metrics
from app.core.config import settings
from app.core.redis import get_redis
from app.db.session import engine
from tests.conftest import BACKEND_DIR
from tests.helpers import API, make_admin


async def test_metrics_count_requests_by_route_template(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{API}/agreements/buyer_signup")).status_code == 200
    assert (await client.get(f"{API}/agreements/buyer_signup")).status_code == 200
    assert (await client.get("/no-such-page")).status_code == 404
    await metrics.flush()

    body = (await client.get("/metrics")).text
    route = f"{API}/agreements/{{key}}"
    assert f'partmachine_http_requests_total{{method="GET",route="{route}",status="200"}} 2' in body
    # آدرس ناشناخته برچسب جدا نمی‌سازد
    assert 'route="unmatched",status="404"' in body
    assert "/no-such-page" not in body
    assert (
        f'partmachine_http_request_duration_seconds_count{{method="GET",route="{route}"}} 2' in body
    )
    assert 'partmachine_up{component="database"} 1' in body
    assert 'partmachine_up{component="redis"} 1' in body
    # خود /metrics شمرده نمی‌شود
    await metrics.flush()
    assert 'route="/metrics"' not in (await client.get("/metrics")).text


async def test_metrics_show_background_jobs(client: httpx.AsyncClient) -> None:
    redis = get_redis()
    await redis.hset("pm:job:outbox", mapping={"last_finished": 1700000000, "failures": 2})
    await redis.set(metrics.HEARTBEAT_KEY, time.time() - 30)
    body = (await client.get("/metrics")).text
    assert 'partmachine_job_consecutive_failures{job="outbox"} 2' in body
    assert 'partmachine_job_last_finished_timestamp_seconds{job="outbox"} 1700000000' in body
    age = next(
        line for line in body.splitlines() if line.startswith("partmachine_worker_heartbeat_age")
    )
    assert 25 <= float(age.split()[-1]) <= 40


async def test_public_status_reveals_only_up_or_down(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{API}/status")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def health_notifications() -> list[str]:
    async with engine.connect() as conn:
        rows = await conn.scalars(
            text("SELECT title FROM notifications WHERE kind = 'system_health' ORDER BY created_at")
        )
        return list(rows)


async def test_site_down_alert_is_sent_once_and_recovery_is_announced(
    client_factory: Callable[[], httpx.AsyncClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    await make_admin(client_factory())
    monkeypatch.setattr(settings, "health_watch_enabled", True)
    up = {"API": True, "سایت": True}
    monkeypatch.setattr(health_watch, "probe", lambda url: up["API" if "/ready" in url else "سایت"])

    assert await health_watch.run() == {"failing": 0}
    up["API"] = False
    assert (await health_watch.run())["alerted"] == 0  # یک بار شکست هنوز هشدار نیست
    assert (await health_watch.run())["alerted"] == 1
    assert (await health_watch.run())["alerted"] == 0  # تا برگشتن، هشدار تکراری نمی‌آید
    up["API"] = True
    assert (await health_watch.run())["recovered"] == 1
    assert await health_notifications() == [
        "هشدار: سایت از دسترس خارج شده است",
        "سایت دوباره در دسترس است",
    ]


async def test_a_single_failed_check_does_not_alert(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "health_watch_enabled", True)
    results = iter([False, False, True, True])
    monkeypatch.setattr(health_watch, "probe", lambda url: next(results))
    assert (await health_watch.run())["alerted"] == 0
    assert await health_watch.run() == {"failing": 0}
    assert await health_notifications() == []


async def test_watch_is_off_outside_production() -> None:
    assert settings.watch_health is False
    assert await health_watch.run() == {"skipped": 1}


async def test_stale_backups_alert_admins_once_per_outage(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    await make_admin(client_factory())
    redis = get_redis()
    await redis.set(health_watch.BACKUP_KEY, time.time() - 27 * 3600)
    assert await health_watch.check_backup() is True
    assert await health_watch.check_backup() is False  # تکراری نمی‌آید
    # پشتیبان تازه ثبت شد؛ خرابی بعدی دوباره خبر داده می‌شود
    await redis.set(health_watch.BACKUP_KEY, time.time())
    assert await health_watch.check_backup() is False
    await redis.set(health_watch.BACKUP_KEY, time.time() - 30 * 3600)
    assert await health_watch.check_backup() is True
    assert await health_notifications() == ["هشدار: بیش از یک روز است پشتیبان‌گیری انجام نشده"] * 2
    body = (await client_factory().get("/metrics")).text
    assert "partmachine_backup_last_success_timestamp_seconds" in body


async def test_backups_kept_on_the_same_server_are_reported_weekly(
    client_factory: Callable[[], httpx.AsyncClient],
) -> None:
    await make_admin(client_factory())
    redis = get_redis()
    assert await health_watch.check_backup_location() is False  # هنوز پشتیبانی گرفته نشده است
    await redis.set(health_watch.BACKUP_OFFSITE_KEY, "1")
    assert await health_watch.check_backup_location() is False
    await redis.set(health_watch.BACKUP_OFFSITE_KEY, "0")
    assert await health_watch.check_backup_location() is True
    assert await health_watch.check_backup_location() is False  # تا یک هفته تکراری نمی‌آید
    assert await health_notifications() == ["پشتیبان‌ها فقط روی همین سرور نگه داشته می‌شوند"]
    body = (await client_factory().get("/metrics")).text
    assert "partmachine_backup_offsite 0" in body


async def test_the_worker_health_probe_passes_the_production_host_check() -> None:
    """worker سلامت API را با آدرس داخلی (API_INTERNAL_URL) می‌آزماید؛ همان میزبان باید در ALLOWED_HOSTS
    باشد، وگرنه پاسخ 400 هشدار دروغ «سایت پایین است» می‌دهد (پیدا شده در بازبینی ۲۰۲۶/۱۰/۲۶)."""
    compose = (BACKEND_DIR.parent / "deploy" / "docker-compose.prod.yml").read_text(
        encoding="utf-8"
    )
    hosts = re.search(r"^\s*ALLOWED_HOSTS:\s*(.+)$", compose, re.M)
    internal = re.search(r"^\s*API_INTERNAL_URL:\s*(.+)$", compose, re.M)
    assert hosts and internal
    allowed = [
        h.strip() for h in hosts.group(1).replace("${APP_DOMAIN}", "app.example.ir").split(",")
    ]
    probe_host = urlsplit(internal.group(1).strip()).hostname

    app = Starlette(routes=[Route("/ready", lambda request: PlainTextResponse("ok"))])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as client:
        probe = await client.get(f"http://{probe_host}:8000/ready")
        outsider = await client.get("http://evil.example/ready")
    assert probe.status_code == 200
    assert outsider.status_code == 400


async def test_a_fresh_install_waits_a_day_for_the_first_backup() -> None:
    redis = get_redis()
    assert await health_watch.check_backup() is False
    await redis.set(health_watch.BACKUP_MISSING_KEY, time.time() - 27 * 3600)
    assert await health_watch.check_backup() is True
