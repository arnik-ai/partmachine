"""پیکربندی ناامن در staging/production اجازه‌ی شروع نمی‌دهد (F10 / AUTH9 گزارش فاز ۰)."""

import os

import httpx
import pytest

from app import main, seed
from app.core.config import Settings

SAFE_PRODUCTION = {
    "environment": "production",
    "secret_key": "q" * 48,
    "database_url": "postgresql+asyncpg://pm:secret@db.internal:5432/partmachine",
    "redis_url": "redis://cache.internal:6379/0",
    "cors_origins": "https://app.partmachine.ir",
    "allowed_hosts": "api.partmachine.ir",
    # مطلق در ویندوز و لینوکس
    "storage_local_dir": os.path.abspath("/srv/partmachine/files"),
}


def test_safe_production_settings_have_no_problems() -> None:
    assert Settings(**SAFE_PRODUCTION).problems() == []  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ({"secret_key": "short"}, "SECRET_KEY"),
        ({"cors_origins": "*"}, "CORS_ORIGINS"),
        ({"cors_origins": "http://app.partmachine.ir"}, "CORS_ORIGINS"),
        ({"allowed_hosts": "*"}, "ALLOWED_HOSTS"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"database_url": "sqlite+aiosqlite:///./partmachine.db"}, "DATABASE_URL"),
        ({"storage_local_dir": "var/storage"}, "STORAGE_LOCAL_DIR"),
        ({"otp_sender": "console"}, "OTP_SENDER"),
        ({"rate_limit_enabled": False}, "RATE_LIMIT_ENABLED"),
    ],
)
def test_unsafe_production_settings_are_reported(
    override: dict[str, object], expected: str
) -> None:
    problems = Settings(**{**SAFE_PRODUCTION, **override}).problems()  # type: ignore[arg-type]
    assert any(expected in p for p in problems)


def test_production_requires_explicit_urls_and_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    # conftest این متغیرها را برای پایگاه تست تنظیم کرده است؛ اینجا «تنظیم‌نشده» را می‌آزماییم
    for name in ("DATABASE_URL", "REDIS_URL", "SECRET_KEY"):
        monkeypatch.delenv(name, raising=False)
    problems = Settings(
        environment="production", cors_origins="https://a.ir", allowed_hosts="a.ir"
    ).problems()
    joined = " ".join(problems)
    assert "SECRET_KEY" in joined and "DATABASE_URL" in joined and "REDIS_URL" in joined


def test_development_defaults_are_accepted() -> None:
    assert Settings(environment="development").problems() == []


def test_one_time_codes_stay_off_in_production_until_a_provider_is_chosen() -> None:
    # P8: کد در لاگ فقط برای توسعه؛ سرویس واقعی پیامک/ایمیل فقط پس از تأیید مالک
    assert Settings(**SAFE_PRODUCTION).otp_sender_name == "disabled"  # type: ignore[arg-type]
    assert Settings(environment="development").otp_sender_name == "console"


def test_app_refuses_to_start_with_unsafe_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main.settings, "environment", "production")
    with pytest.raises(RuntimeError, match="Unsafe configuration"):
        main.create_app()


async def test_docs_are_hidden_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    production = {
        "environment": "production",
        "secret_key": "q" * 48,
        "cors_origins": "https://app.partmachine.ir",
        "allowed_hosts": "testserver",
    }
    for name, value in production.items():
        monkeypatch.setattr(main.settings, name, value)
    # لاگ JSON تولید را روی بقیه‌ی تست‌ها اعمال نکن
    monkeypatch.setattr(main, "configure_logging", lambda _settings: None)
    production_app = main.create_app()
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/openapi.json")).status_code == 404
        assert (await client.get("/health")).status_code == 200


async def test_seed_refuses_to_run_outside_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed.settings, "environment", "production")
    with pytest.raises(SystemExit):
        await seed.seed()
