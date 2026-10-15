"""پیکربندی برنامه — از متغیرهای محیطی یا فایل .env خوانده می‌شود.

پیش‌فرض‌ها برای توسعه‌ی محلی‌اند (docker-compose ریشه‌ی مخزن). در staging و production
هر تنظیم ناامن باعث توقف برنامه هنگام شروع می‌شود؛ فهرست کامل در `Settings.problems()`.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "staging", "production"]
# ارسال کد یک‌بارمصرف (P8): console فقط برای توسعه و تست (کد در لاگ)؛ تا انتخاب و تأیید سرویس
# پیامک/ایمیل واقعی، در تولید disabled است
OtpSender = Literal["console", "disabled"]

DEV_SECRET_KEY = "dev-only-insecure-secret-key-do-not-use-in-production"
DEV_DATABASE_URL = "postgresql+asyncpg://partmachine:partmachine@localhost:5433/partmachine"
DEV_REDIS_URL = "redis://localhost:6380/0"


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Environment = "development"
    app_name: str = "PartMachine API"
    api_v1_prefix: str = "/api/v1"

    database_url: str = DEV_DATABASE_URL
    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_statement_timeout_ms: int = 15_000

    redis_url: str = DEV_REDIS_URL

    secret_key: str = DEV_SECRET_KEY
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14

    # رشته‌های جداشده با کاما
    cors_origins: str = "http://localhost:3100"
    allowed_hosts: str = "*"

    # None یعنی «بر اساس محیط»: در development/test خاموش، در staging/production روشن
    cookie_secure: bool | None = None
    docs_enabled: bool | None = None
    rate_limit_enabled: bool = True
    rate_limit_fail_open: bool | None = None
    log_json: bool | None = None

    max_body_bytes: int = 1_000_000
    # فایل‌ها: فعلاً دیسک محلی (در تولید یک volume پایدار)؛ پیاده‌سازی S3 با انتخاب سرویس در فاز ۴
    storage_local_dir: str = "var/storage"
    upload_max_bytes: int = 50 * 1024 * 1024
    download_link_ttl_seconds: int = 120
    business_timezone: str = "Asia/Tehran"
    log_level: str = "INFO"
    # None یعنی «بر اساس محیط»: console در development/test، disabled در staging/production
    otp_sender: OtpSender | None = None

    @property
    def is_production_like(self) -> bool:
        return self.environment in ("staging", "production")

    @property
    def cors_origin_list(self) -> list[str]:
        return _split(self.cors_origins)

    @property
    def allowed_host_list(self) -> list[str]:
        return _split(self.allowed_hosts)

    @property
    def secure_cookies(self) -> bool:
        return self.cookie_secure if self.cookie_secure is not None else self.is_production_like

    @property
    def show_docs(self) -> bool:
        return self.docs_enabled if self.docs_enabled is not None else not self.is_production_like

    @property
    def otp_sender_name(self) -> OtpSender:
        if self.otp_sender is not None:
            return self.otp_sender
        return "disabled" if self.is_production_like else "console"

    @property
    def rate_limit_should_fail_open(self) -> bool:
        if self.rate_limit_fail_open is not None:
            return self.rate_limit_fail_open
        return not self.is_production_like

    @property
    def json_logs(self) -> bool:
        return self.log_json if self.log_json is not None else self.is_production_like

    def problems(self) -> list[str]:
        """تنظیمات ناامن یا نامعتبر را برمی‌گرداند؛ لیست خالی یعنی آماده‌ی اجرا."""
        found: list[str] = []
        if not self.database_url.startswith("postgresql+asyncpg://"):
            found.append(
                "DATABASE_URL must be a postgresql+asyncpg:// URL (SQLite is not supported)"
            )
        if not self.is_production_like:
            return found

        if self.secret_key == DEV_SECRET_KEY or len(self.secret_key.encode()) < 32:
            found.append("SECRET_KEY must be a random value of at least 32 bytes")
        if "database_url" not in self.model_fields_set:
            found.append("DATABASE_URL must be set explicitly")
        if "redis_url" not in self.model_fields_set:
            found.append("REDIS_URL must be set explicitly")
        origins = self.cors_origin_list
        if not origins or any(o == "*" or not o.startswith("https://") for o in origins):
            found.append("CORS_ORIGINS must list explicit https:// origins")
        hosts = self.allowed_host_list
        if not hosts or "*" in hosts:
            found.append("ALLOWED_HOSTS must list explicit host names")
        if not self.secure_cookies:
            found.append("COOKIE_SECURE must not be disabled")
        if (
            "storage_local_dir" not in self.model_fields_set
            or not Path(self.storage_local_dir).is_absolute()
        ):
            found.append(
                "STORAGE_LOCAL_DIR must be an explicit absolute path on persistent storage"
            )
        if self.otp_sender_name == "console":
            found.append("OTP_SENDER=console writes one-time codes to the logs; not allowed here")
        # فقط برای API آزمایشیِ آزمون مرورگر خاموش می‌شود؛ در staging و production هرگز
        if not self.rate_limit_enabled:
            found.append("RATE_LIMIT_ENABLED must not be disabled")
        return found


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
