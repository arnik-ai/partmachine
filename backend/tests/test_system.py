"""سلامت، request-id، هدرهای امنیتی، محدودیت حجم، خطاهای عمومی و CORS (SYS1–SYS4، AUTH10)."""

from typing import NoReturn

import httpx
import pytest
from redis.asyncio import Redis

from app.core import health, rate_limit
from app.core.config import settings
from app.modules.pricing import router as pricing_router
from tests.helpers import API


async def test_health_and_ready(client: httpx.AsyncClient) -> None:
    assert (await client.get("/health")).json() == {"status": "ok"}
    ready = await client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"] == {"database": "ok", "redis": "ok"}


async def test_ready_returns_503_when_database_is_down(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class BrokenEngine:
        def connect(self) -> NoReturn:
            raise OSError("connection refused")

    monkeypatch.setattr(health, "engine", BrokenEngine())
    response = await client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "checks": {"database": "unavailable", "redis": "ok"},
    }


@pytest.mark.parametrize(("fail_open", "expected_status"), [(False, 503), (True, 401)])
async def test_rate_limiter_behaviour_when_redis_is_down(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    fail_open: bool,
    expected_status: int,
) -> None:
    """production: درخواست رد می‌شود (fail-closed)؛ development: با هشدار ادامه می‌یابد."""
    broken = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.5, socket_timeout=0.5)
    monkeypatch.setattr(rate_limit, "get_redis", lambda: broken)
    monkeypatch.setattr(settings, "rate_limit_fail_open", fail_open)
    try:
        response = await client.post(
            f"{API}/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
        )
    finally:
        await broken.aclose()
    assert response.status_code == expected_status
    if expected_status == 503:
        assert response.json()["code"] == "service_unavailable"


async def test_request_id_is_echoed_or_generated(client: httpx.AsyncClient) -> None:
    echoed = await client.get("/health", headers={"X-Request-ID": "trace-123"})
    assert echoed.headers["X-Request-ID"] == "trace-123"
    replaced = await client.get("/health", headers={"X-Request-ID": "bad id with spaces"})
    assert replaced.headers["X-Request-ID"] != "bad id with spaces"
    assert len(replaced.headers["X-Request-ID"]) == 32


async def test_security_headers_and_no_store(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{API}/suppliers")
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


async def test_oversized_body_is_rejected_before_parsing(client: httpx.AsyncClient) -> None:
    payload = '{"email": "a@b.co", "password": "' + "x" * 1_200_000 + '"}'
    response = await client.post(
        f"{API}/auth/login", content=payload, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "حجم درخواست بیش از حد مجاز است."


async def test_long_names_get_validation_error_not_500(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{API}/auth/register",
        json={
            "email": "long@example.com",
            "password": "Passw0rd-long!",
            "fullName": "ن" * 500,
            "role": "buyer",
        },
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "fullName"


async def test_unknown_route_is_persian_404(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{API}/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_unexpected_errors_hide_internals(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(**_: object) -> None:
        raise RuntimeError("database password is hunter2")

    monkeypatch.setattr(pricing_router, "estimate_price", boom)
    response = await client.post(
        f"{API}/pricing/estimate", json={"capability": "cnc", "material": "x", "quantity": 1}
    )
    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert body["requestId"] == response.headers["X-Request-ID"]
    assert "hunter2" not in response.text and "Traceback" not in response.text


async def test_cors_allows_only_configured_origins(client: httpx.AsyncClient) -> None:
    preflight = {"Access-Control-Request-Method": "POST"}
    evil = await client.options(
        f"{API}/auth/login", headers={**preflight, "Origin": "https://evil.example"}
    )
    assert evil.status_code == 400
    assert "access-control-allow-origin" not in evil.headers
    good = await client.options(
        f"{API}/auth/login", headers={**preflight, "Origin": "http://localhost:3100"}
    )
    assert good.status_code == 200
    assert good.headers["access-control-allow-origin"] == "http://localhost:3100"
    assert good.headers["access-control-allow-credentials"] == "true"
