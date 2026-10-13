from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """پیکربندی برنامه — از متغیرهای محیطی یا فایل .env خوانده می‌شود."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PartMachine API"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "sqlite+aiosqlite:///./partmachine.db"

    secret_key: str = "change-me-in-production-a-very-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14

    # رشته‌ی جداشده با کاما؛ به لیست تبدیل می‌شود
    cors_origins: str = "http://localhost:3000,https://arnik-ai.github.io"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
