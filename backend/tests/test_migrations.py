"""migrationها روی یک پایگاه جدا و خالی: بالا، پایین، دوباره بالا — و انواع ستون‌ها درست باشند."""

import asyncio

import asyncpg
from alembic import command

from tests.conftest import TEST_DATABASE_URL, alembic_config, drop_database, ensure_database

SCRATCH_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/partmachine_migrations_test"


async def _fetch(sql: str) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(SCRATCH_URL.replace("postgresql+asyncpg://", "postgresql://"))
    try:
        return await conn.fetch(sql)
    finally:
        await conn.close()


async def test_upgrade_downgrade_upgrade_on_empty_database() -> None:
    await drop_database(SCRATCH_URL)
    await ensure_database(SCRATCH_URL)
    cfg = alembic_config(SCRATCH_URL)
    try:
        await asyncio.to_thread(command.upgrade, cfg, "head")

        timestamps = await _fetch(
            "SELECT table_name, column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'"
        )
        assert timestamps, "no timestamp columns found"
        assert {r["data_type"] for r in timestamps} == {"timestamp with time zone"}

        price = await _fetch(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'quotations' AND column_name = 'total_price_rials'"
        )
        assert price[0]["data_type"] == "bigint"

        constraints = {r["conname"] for r in await _fetch("SELECT conname FROM pg_constraint")}
        assert {
            "fk_rfqs_awarded_quotation",
            "uq_quotations_rfq_supplier",
            "ck_rfqs_status_valid",
            "ck_quotations_price_positive",
            "ck_users_email_lowercase",
        } <= constraints

        await asyncio.to_thread(command.downgrade, cfg, "base")
        tables = await _fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        )
        assert tables == []

        await asyncio.to_thread(command.upgrade, cfg, "head")
    finally:
        await drop_database(SCRATCH_URL)
