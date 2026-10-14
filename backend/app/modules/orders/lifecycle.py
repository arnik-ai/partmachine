"""چرخه‌ی سفارش در یک جا: کدام اقدام، از کدام وضعیت، توسط کدام طرف، به کدام وضعیت.

سرویس فقط از همین جدول استفاده می‌کند و فرانت هم فهرست «کارهای مجاز من» را از سرور می‌گیرد؛
قاعده‌ای در دو جا تکرار نمی‌شود. گام‌های بعدی فاز ۳ (قرارداد، پرداخت، بازرسی، اختلاف) اقدام‌های
خود را به همین جدول اضافه می‌کنند.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.modules.orders.models import Order

Side = Literal["buyer", "supplier", "admin"]
Action = Literal["cancel", "ship", "confirm_delivery"]

OPEN_STATUSES = frozenset(
    {"awaiting_contract", "awaiting_prepayment", "in_production", "in_inspection", "shipped"}
)
# تعهد تحویل پس از امضای قرارداد شروع می‌شود؛ «دیرکرد» فقط در این وضعیت‌ها معنا دارد
DELIVERY_PENDING = frozenset({"awaiting_prepayment", "in_production", "in_inspection"})


@dataclass(frozen=True)
class Transition:
    from_statuses: frozenset[str]
    to_status: str
    sides: frozenset[Side]
    # پیام وقتی وضعیت فعلی اجازه نمی‌دهد
    blocked: str


TRANSITIONS: dict[Action, Transition] = {
    "cancel": Transition(
        frozenset({"awaiting_contract"}),
        "cancelled",
        frozenset({"buyer", "supplier"}),
        "پس از امضای قرارداد، سفارش فقط با توافق دو طرف یا تصمیم پشتیبانی لغو می‌شود.",
    ),
    "ship": Transition(
        frozenset({"in_production"}),
        "shipped",
        frozenset({"supplier"}),
        "ارسال فقط پس از امضای قرارداد و شروع تولید ممکن است.",
    ),
    "confirm_delivery": Transition(
        frozenset({"shipped"}),
        "delivered",
        frozenset({"buyer"}),
        "تحویل فقط پس از ارسال سفارش تأیید می‌شود.",
    ),
}


def allowed_actions(order: Order, side: Side | None) -> list[Action]:
    if side is None:
        return []
    return [
        action
        for action, rule in TRANSITIONS.items()
        if side in rule.sides and order.status in rule.from_statuses
    ]


def is_overdue(order: Order, today: date) -> bool:
    return order.status in DELIVERY_PENDING and today > order.delivery_due
