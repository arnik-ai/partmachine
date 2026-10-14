from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
    connect_args={
        "server_settings": {
            "application_name": "partmachine-api",
            # هیچ کوئری‌ای نباید یک اتصال را بی‌نهایت نگه دارد
            "statement_timeout": str(settings.db_statement_timeout_ms),
        }
    },
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """وابستگی FastAPI: یک session برای هر درخواست. تراکنش‌ها را سرویس‌ها commit می‌کنند؛
    هر خطا قبل از commit با بسته‌شدن session خودبه‌خود rollback می‌شود."""
    async with SessionLocal() as session:
        yield session
