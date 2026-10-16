"""چرخه‌ی سفارش در یک جا: کدام اقدام، از کدام وضعیت، توسط کدام طرف، به کدام وضعیت.

سرویس فقط از همین جدول استفاده می‌کند و فرانت هم فهرست «کارهای مجاز من» را از سرور می‌گیرد؛
قاعده‌ای در دو جا تکرار نمی‌شود. گام‌های بعدی فاز ۳ (قرارداد، پرداخت، بازرسی، اختلاف) اقدام‌های
خود را به همین جدول اضافه می‌کنند؛ بازرسی کیفیت شرط «ارسال» را تعیین می‌کند (ship_ready).
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.modules.orders.models import Order

# qc: آزمایشگاهی که کارفرما برای بازرسی همین سفارش انتخاب کرده است (فقط بخش بازرسی را می‌بیند)
Side = Literal["buyer", "supplier", "qc", "admin"]
# keep: «ادامه‌ی سفارش» — پس گرفتن یا نپذیرفتن درخواست لغو (وضعیت عوض نمی‌شود)
Action = Literal["cancel", "confirm_material", "ship", "confirm_delivery", "dispute", "keep"]

OPEN_STATUSES = frozenset(
    {
        "awaiting_contract",
        "awaiting_prepayment",
        "awaiting_material",
        "in_production",
        "in_inspection",
        "shipped",
    }
)
# پس از امضای قرارداد و پیش از تکمیل: لغو فقط با توافق دو طرف و «اعلام مشکل» ممکن است (O11)
SIGNED_OPEN = frozenset(
    {
        "awaiting_prepayment",
        "awaiting_material",
        "in_production",
        "in_inspection",
        "shipped",
        "delivered",
    }
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
    # وضعیت‌هایی که یعنی این اقدام قبلاً انجام شده (درخواست تکراری بی‌اثر و موفق است)
    done_statuses: frozenset[str] = frozenset()

    def already_done(self, status: str) -> bool:
        return status == self.to_status or status in self.done_statuses


TRANSITIONS: dict[Action, Transition] = {
    # پیش از امضا: لغو فوری با دلیل. پس از امضا: درخواست یک طرف و موافقت طرف دیگر (O11)
    "cancel": Transition(
        frozenset({"awaiting_contract"}) | SIGNED_OPEN,
        "cancelled",
        frozenset({"buyer", "supplier"}),
        "این سفارش دیگر قابل لغو نیست. اگر مشکلی هست، «اعلام مشکل» کنید.",
    ),
    # کارفرما قطعه یا مواد را فرستاده و مجری رسیدنش را اعلام می‌کند ⇒ تولید و مهلت تحویل شروع می‌شود
    "confirm_material": Transition(
        frozenset({"awaiting_material"}),
        "in_production",
        frozenset({"supplier"}),
        "رسیدن قطعه پس از امضای قرارداد (و پیش‌پرداخت، اگر هست) اعلام می‌شود.",
        frozenset({"in_inspection", "shipped", "delivered", "completed"}),
    ),
    # با بازرسی کیفیت، ارسال از «در حال بازرسی» و فقط پس از قبولی است (ship_ready)
    "ship": Transition(
        frozenset({"in_production", "in_inspection"}),
        "shipped",
        frozenset({"supplier"}),
        "ارسال فقط پس از امضای قرارداد و شروع تولید ممکن است.",
        frozenset({"delivered", "completed"}),
    ),
    "confirm_delivery": Transition(
        frozenset({"shipped"}),
        "delivered",
        frozenset({"buyer"}),
        "تحویل فقط پس از ارسال سفارش تأیید می‌شود.",
        frozenset({"completed"}),
    ),
    # «اعلام مشکل»: سفارش تا تصمیم پشتیبانی متوقف می‌شود (disputes)
    "dispute": Transition(
        SIGNED_OPEN,
        "disputed",
        frozenset({"buyer", "supplier"}),
        "اعلام مشکل پس از امضای قرارداد و پیش از تکمیل سفارش ممکن است.",
    ),
}


def production_start(order: Order) -> str:
    """وضعیت پس از امضا و پیش‌پرداخت: با قطعه‌ی کارفرما اول منتظر رسیدن قطعه، وگرنه تولید."""
    return "awaiting_material" if order.material_from_buyer else "in_production"


def ship_ready(order: Order, inspection_status: str | None) -> bool:
    """بدون بازرسی: از «در حال تولید». با بازرسی انتخاب‌شده: فقط پس از قبولی (O9)."""
    if inspection_status is None:
        return order.status == "in_production"
    return order.status == "in_inspection" and inspection_status == "passed"


def allowed_actions(
    order: Order, side: Side | None, inspection_status: str | None = None
) -> list[Action]:
    if side is None:
        return []
    actions: list[Action] = [
        action
        for action, rule in TRANSITIONS.items()
        if side in rule.sides
        and order.status in rule.from_statuses
        and (action != "ship" or ship_ready(order, inspection_status))
    ]
    pending = order.cancel_requested_side
    if pending is not None and order.status in SIGNED_OPEN and side in ("buyer", "supplier"):
        actions.append("keep")
        if pending == side:
            actions.remove("cancel")  # درخواست خودش در انتظار پاسخ طرف مقابل است
    return actions


def is_overdue(order: Order, today: date) -> bool:
    # با قطعه‌ی کارفرما، مهلت تحویل تا رسیدن قطعه شروع نشده است
    if order.material_from_buyer and order.material_received_at is None:
        return False
    return order.status in DELIVERY_PENDING and today > order.delivery_due
