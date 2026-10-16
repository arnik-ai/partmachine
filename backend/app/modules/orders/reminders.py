"""یادآوری خودکار موعد تحویل (کار worker، گام 4d).

برای سفارش‌هایی که امضا شده‌اند ولی هنوز ارسال نشده‌اند:
- «نزدیک موعد»: از `DUE_SOON_DAYS` روز مانده تا خود روز موعد، یک بار برای قطعه‌ساز.
- «گذشته از موعد»: از روز بعد از موعد، یک بار برای هر دو طرف.

هر یادآوری برای هر سفارش فقط یک بار فرستاده می‌شود (کلید یکتای `order_reminders`)، پس اجرای دوباره‌ی
worker یادآوری تکراری نمی‌سازد.
"""

from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jalali import format_jalali
from app.core.text import fa_digits
from app.modules.orders import lifecycle
from app.modules.orders.models import Order, OrderReminder
from app.modules.orders.service import notify_side, ref

DUE_SOON_DAYS = 3
BATCH_SIZE = 500


async def _claim(db: AsyncSession, order: Order, kind: str) -> bool:
    """یادآوری را ثبت می‌کند؛ False یعنی قبلاً فرستاده شده است."""
    claimed = await db.scalar(
        insert(OrderReminder)
        .values(order_id=order.id, kind=kind)
        .on_conflict_do_nothing()
        .returning(OrderReminder.order_id)
    )
    return claimed is not None


async def send_delivery_reminders(db: AsyncSession, *, today: date) -> dict[str, int]:
    counts = {"due_soon": 0, "overdue": 0}
    orders = await db.scalars(
        select(Order)
        .where(
            Order.status.in_(lifecycle.DELIVERY_PENDING),
            # با قطعه‌ی کارفرما، مهلت تحویل پس از رسیدن قطعه شروع می‌شود
            or_(Order.material_from_buyer.is_(False), Order.material_received_at.is_not(None)),
            Order.delivery_due <= today + timedelta(days=DUE_SOON_DAYS),
        )
        .order_by(Order.delivery_due)
        .limit(BATCH_SIZE)
        # سفارشی که همین حالا در حال تغییر است در اجرای بعدی دیده می‌شود (ترتیب قفل: اول سفارش)
        .with_for_update(skip_locked=True)
    )
    for order in orders.all():
        due = format_jalali(order.delivery_due)
        if order.delivery_due < today:
            if not await _claim(db, order, "overdue"):
                continue
            title = f"موعد تحویل سفارش {ref(order)} گذشته است"
            await notify_side(
                db,
                order,
                "supplier",
                None,
                kind="order_overdue",
                title=title,
                body=f"موعد تحویل {due} بود و سفارش هنوز ارسال نشده است."
                " اگر تأخیر دارید، با کارفرما هماهنگ کنید.",
            )
            await notify_side(
                db,
                order,
                "buyer",
                None,
                kind="order_overdue",
                title=title,
                body=f"موعد تحویل {due} بود و قطعه‌ساز هنوز سفارش را ارسال نکرده است.",
            )
            counts["overdue"] += 1
        else:
            if not await _claim(db, order, "due_soon"):
                continue
            days_left = (order.delivery_due - today).days
            when = "امروز است" if days_left == 0 else f"{fa_digits(days_left)} روز دیگر است"
            await notify_side(
                db,
                order,
                "supplier",
                None,
                kind="order_due_soon",
                title=f"موعد تحویل سفارش {ref(order)} نزدیک است",
                body=f"موعد تحویل ({due}) {when}.",
            )
            counts["due_soon"] += 1
    await db.commit()
    return counts
