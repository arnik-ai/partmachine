"""بررسی سلامت اجزای سامانه، مشترک بین `/ready`، `/api/v1/status`، `/metrics` و هشدار worker."""

import asyncio

from sqlalchemy import text

from app.core.redis import get_redis
from app.db.session import engine

TIMEOUT_SECONDS = 3


async def _database() -> bool:
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def _redis() -> bool:
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            await get_redis().ping()
        return True
    except Exception:
        return False


async def components() -> dict[str, bool]:
    """وضعیت پایگاه داده و Redis؛ هر کدام حداکثر چند ثانیه منتظر می‌ماند."""
    database, redis = await asyncio.gather(_database(), _redis())
    return {"database": database, "redis": redis}
