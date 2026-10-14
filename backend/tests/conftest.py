"""تنظیمات مشترک تست‌ها.

تست‌ها روی PostgreSQL واقعی (پایگاه `partmachine_test`) و Redis (db 15) اجرا می‌شوند؛
SQLite رفتار PostgreSQL را پنهان می‌کند (گزارش فاز ۰: F02, F09). پیش‌نیاز:
    docker compose up -d db redis
"""

import asyncio
import os
import shutil
import tempfile
from collections.abc import AsyncIterator, Callable
from pathlib import Path

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://partmachine:partmachine@localhost:5433/partmachine_test",
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6380/15")

# حفاظ: تست‌ها جدول‌ها را خالی می‌کنند؛ هرگز روی پایگاهی که نامش به _test ختم نشود اجرا نشوند
if not TEST_DATABASE_URL.rsplit("/", 1)[-1].endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must point to a database whose name ends with _test")

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["REDIS_URL"] = TEST_REDIS_URL
os.environ["CORS_ORIGINS"] = "http://localhost:3100"
# فایل‌های تست در یک پوشه‌ی موقت جدا، نه در var/storage توسعه
os.environ["STORAGE_LOCAL_DIR"] = tempfile.mkdtemp(prefix="pm-test-storage-")

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.redis import close_redis, get_redis  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
TABLES = (
    "audit_events, agreement_acceptances, contract_signatures, contract_versions, contracts, "
    "order_events, files, orders, verification_requests, organization_invites, refresh_tokens, "
    "quotations, rfqs, suppliers, users, organizations"
)


def alembic_config(database_url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["database_url"] = database_url
    cfg.attributes["skip_logging_config"] = True
    return cfg


async def ensure_database(database_url: str) -> None:
    dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")
    server, name = dsn.rsplit("/", 1)
    conn = await asyncpg.connect(f"{server}/postgres")
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name):
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def drop_database(database_url: str) -> None:
    dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")
    server, name = dsn.rsplit("/", 1)
    conn = await asyncpg.connect(f"{server}/postgres")
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    await ensure_database(TEST_DATABASE_URL)
    cfg = alembic_config(TEST_DATABASE_URL)
    # هر اجرا از schema تمیز شروع می‌شود؛ خود این کار مسیر downgrade/upgrade را هم می‌آزماید
    await asyncio.to_thread(command.downgrade, cfg, "base")
    await asyncio.to_thread(command.upgrade, cfg, "head")
    yield
    await engine.dispose()
    await close_redis()
    shutil.rmtree(os.environ["STORAGE_LOCAL_DIR"], ignore_errors=True)


def _empty_storage() -> None:
    for child in Path(os.environ["STORAGE_LOCAL_DIR"]).iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


@pytest.fixture(autouse=True)
async def clean_state(database: None) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    await get_redis().flushdb()
    await asyncio.to_thread(_empty_storage)


@pytest.fixture
async def client_factory() -> AsyncIterator[Callable[[], httpx.AsyncClient]]:
    """هر کاربر کلاینت جدا (و کوکی جدا) دارد، مثل دو مرورگر متفاوت."""
    clients: list[httpx.AsyncClient] = []

    def make() -> httpx.AsyncClient:
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        )
        clients.append(client)
        return client

    yield make
    for client in clients:
        await client.aclose()


@pytest.fixture
async def client(client_factory: Callable[[], httpx.AsyncClient]) -> httpx.AsyncClient:
    return client_factory()
