"""امتیاز ۱ تا ۵ کارفرما پس از تکمیل سفارش (O12)؛ سابقه‌ی قطعه‌ساز همان لحظه به‌روز می‌شود."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, Forbidden
from app.core.text import fa_digits
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.orders import service as orders
from app.modules.orders.schemas import OrderDetailOut
from app.modules.ratings.models import OrderRating
from app.modules.ratings.schemas import RatingInput
from app.modules.suppliers import track_record


async def rate_order(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: RatingInput
) -> OrderDetailOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    if side != "buyer":
        raise Forbidden("امتیاز را کارفرمای سفارش می‌دهد.", code="not_your_step")
    if order.status != "completed":
        raise Conflict("امتیاز پس از تکمیل سفارش ثبت می‌شود.", code="order_not_completed")
    rating = await db.scalar(
        select(OrderRating).where(OrderRating.order_id == order.id).with_for_update()
    )
    if rating is not None and (rating.score, rating.comment) == (data.score, data.comment):
        return await orders.get_order(db, user, order.id)  # درخواست تکراری: بی‌اثر

    now = utcnow()
    if rating is None:
        db.add(
            OrderRating(
                id=uuid.uuid4(),
                order_id=order.id,
                supplier_id=order.supplier_id,
                rated_by_id=user.id,
                score=data.score,
                comment=data.comment,
                created_at=now,
                updated_at=now,
            )
        )
    else:
        rating.score = data.score
        rating.comment = data.comment
        rating.rated_by_id = user.id
        rating.updated_at = now
    stars = f"امتیاز {fa_digits(data.score)} از ۵"
    orders.record_event(
        db,
        order,
        "rated",
        None,
        None,
        user,
        side,
        f"{stars} — {data.comment}" if data.comment else stars,
    )
    await orders.notify_side(
        db,
        order,
        "supplier",
        user,
        kind="order_rated",
        title=f"کارفرما به سفارش {orders.ref(order)} {stars} داد",
        body=data.comment,
    )
    audit.record(
        db,
        action="order.rated",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"score": data.score, "updated": rating is not None},
    )
    await track_record.refresh(db, order.supplier_id)
    await db.commit()
    return await orders.get_order(db, user, order.id)
