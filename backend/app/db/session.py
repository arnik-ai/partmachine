from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False, future=True)

SessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """وابستگی FastAPI: یک session دیتابیس برای هر درخواست."""
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """جدول‌ها را در صورت نبود می‌سازد (برای توسعه؛ در تولید از Alembic)."""
    # اطمینان از import شدن همه‌ی مدل‌ها پیش از create_all
    from app import models  # noqa: F401
    from app.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
