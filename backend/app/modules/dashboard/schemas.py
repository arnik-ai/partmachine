from typing import Literal

from app.core.schemas import CamelModel

StatKey = Literal[
    # کارفرما و مأمور خرید
    "open_rfqs",
    "quotes_received",
    # قطعه‌ساز
    "open_market_rfqs",
    "active_quotes",
    # طرف‌های سفارش
    "active_orders",
    "completed_orders",
    # آزمایشگاه
    "inspections_waiting",
    "inspections_ready",
    "inspections_passed",
    # ادمین
    "pending_verifications",
    "open_disputes",
    "unverified_accounts",
    "active_users",
]


class StatOut(CamelModel):
    key: StatKey
    value: int


class DashboardOut(CamelModel):
    """آمار واقعی داشبورد برای نقش کاربر جاری؛ برچسب‌ها و آیکون‌ها با فرانت است."""

    stats: list[StatOut]
