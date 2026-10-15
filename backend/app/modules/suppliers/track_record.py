"""سابقه‌ی واقعی قطعه‌ساز در تراشینو (O12).

`refresh` همه‌ی شمارش‌ها را از منبع اصلی دوباره می‌سازد (نه افزایش تدریجی)، پس تکرار یا ترتیب
فراخوانی اشتباه نمی‌سازد. ردیف قطعه‌ساز قفل می‌شود تا دو تراکنش هم‌زمان (مثلاً تکمیل دو سفارش)
شمارش یکدیگر را از بین نبرند؛ ترتیب قفل: اول ردیف سفارش (در فراخواننده)، بعد قطعه‌ساز.

«کم‌کم از داده‌ی واقعی»: هر نرخ یا امتیاز میانگین وزن‌دار مقدار اولیه (با وزن PRIOR_WEIGHT) و
داده‌ی واقعی است؛ با چند سفارش اول تکان شدید نمی‌خورد و با سابقه‌ی بیشتر به داده‌ی واقعی می‌رسد.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.disputes.models import OrderDispute
from app.modules.inspections.models import OrderInspection
from app.modules.orders.models import Order
from app.modules.quotations.models import Quotation
from app.modules.ratings.models import OrderRating
from app.modules.rfqs.models import Rfq
from app.modules.suppliers.models import Supplier

PRIOR_WEIGHT = 3
PRIOR_ON_TIME = 0.9
PRIOR_QUALITY = 85.0
PRIOR_SATISFACTION = 85.0
PRIOR_RESPONSE_HOURS = 6.0


def blend(prior: float, total: float, count: int) -> float:
    """میانگین وزن‌دار مقدار اولیه و داده‌ی واقعی (count داده با مجموع total)."""
    return (prior * PRIOR_WEIGHT + total) / (PRIOR_WEIGHT + count)


@dataclass(frozen=True)
class TrackRecord:
    """شمارش‌های واقعی برای توضیح هر جزء امتیاز اعتماد."""

    completed_jobs: int
    delivered_jobs: int
    on_time_jobs: int
    inspected_jobs: int
    first_pass_jobs: int
    rating_count: int
    rating_total: int
    responses_count: int

    @property
    def rating_average(self) -> float | None:
        return self.rating_total / self.rating_count if self.rating_count else None


def of(supplier: Supplier) -> TrackRecord:
    return TrackRecord(
        completed_jobs=supplier.completed_jobs,
        delivered_jobs=supplier.delivered_jobs,
        on_time_jobs=supplier.on_time_jobs,
        inspected_jobs=supplier.inspected_jobs,
        first_pass_jobs=supplier.first_pass_jobs,
        rating_count=supplier.rating_count,
        rating_total=supplier.rating_total,
        responses_count=supplier.responses_count,
    )


async def refresh(db: AsyncSession, supplier_id: uuid.UUID) -> None:
    """در تراکنش فراخواننده؛ تغییرهای در انتظار پیش از شمارش flush می‌شوند."""
    await db.flush()
    supplier = await db.scalar(
        select(Supplier)
        .where(Supplier.id == supplier_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if supplier is None:
        return

    completed = Order.status == "completed"
    delivered = completed & Order.delivered_at.is_not(None)
    # تحویل به‌موقع: روز تحویل به وقت کسب‌وکار، دیرتر از تاریخ تعهدشده نباشد
    delivered_day = cast(func.timezone(settings.business_timezone, Order.delivered_at), Date)
    orders = (
        await db.execute(
            select(
                func.count().filter(completed),
                func.count().filter(delivered),
                func.count().filter(delivered & (delivered_day <= Order.delivery_due)),
            ).where(Order.supplier_id == supplier_id)
        )
    ).one()
    inspections = (
        await db.execute(
            select(
                func.count().filter(OrderInspection.result_at.is_not(None)),
                func.count().filter(
                    (OrderInspection.status == "passed") & (OrderInspection.attempt == 1)
                ),
            )
            .join(Order, Order.id == OrderInspection.order_id)
            .where(Order.supplier_id == supplier_id)
        )
    ).one()
    ratings = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(OrderRating.score), 0)).where(
                OrderRating.supplier_id == supplier_id
            )
        )
    ).one()
    # فقط مشکل‌هایی که کارفرما اعلام کرده در سابقه‌ی قطعه‌ساز حساب می‌شود
    disputes = await db.scalar(
        select(func.count())
        .select_from(OrderDispute)
        .join(Order, Order.id == OrderDispute.order_id)
        .where(Order.supplier_id == supplier_id, OrderDispute.opened_side == "buyer")
    )
    # سرعت پاسخ: فاصله‌ی انتشار درخواست تا ثبت پیشنهاد این قطعه‌ساز
    responses = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(
                    func.sum(func.extract("epoch", Quotation.created_at - Rfq.created_at)), 0
                ),
            )
            .join(Rfq, Rfq.id == Quotation.rfq_id)
            .where(Quotation.supplier_id == supplier_id)
        )
    ).one()

    supplier.completed_jobs, supplier.delivered_jobs, supplier.on_time_jobs = orders
    supplier.on_time_delivery_rate = blend(
        PRIOR_ON_TIME, supplier.on_time_jobs, supplier.delivered_jobs
    )
    supplier.inspected_jobs, supplier.first_pass_jobs = inspections
    supplier.quality_score = blend(
        PRIOR_QUALITY, 100 * supplier.first_pass_jobs, supplier.inspected_jobs
    )
    supplier.rating_count, supplier.rating_total = int(ratings[0]), int(ratings[1])
    supplier.satisfaction_score = blend(
        PRIOR_SATISFACTION, 20 * supplier.rating_total, supplier.rating_count
    )
    supplier.dispute_count = disputes or 0
    supplier.responses_count = int(responses[0])
    supplier.response_time_hours = round(
        blend(PRIOR_RESPONSE_HOURS, float(responses[1]) / 3600, supplier.responses_count), 1
    )
