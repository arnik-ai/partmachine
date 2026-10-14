"""زمان: همه‌ی زمان‌ها در UTC ذخیره می‌شوند؛ «امروز» کسب‌وکار به وقت ایران است."""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def utcnow() -> datetime:
    return datetime.now(UTC)


def business_today() -> date:
    """تاریخ امروز در منطقه‌ی زمانی کسب‌وکار (پیش‌فرض Asia/Tehran)."""
    return datetime.now(ZoneInfo(settings.business_timezone)).date()
