"""سفارش: ساخت خودکار پس از انتخاب برنده (O1)، فهرست و جزئیات برای دو طرف، و انتقال‌های
چرخه‌ی وضعیت با قفل ردیف، تاریخچه و audit. دسترسی فقط برای دو سازمان طرف سفارش و ادمین."""

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import Conflict, Forbidden, NotFound, field_error
from app.core.time import business_today, utcnow
from app.modules.audit import service as audit
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.orders import lifecycle
from app.modules.orders.lifecycle import Action, Side
from app.modules.orders.models import Order, OrderEvent
from app.modules.orders.schemas import (
    OrderDetailOut,
    OrderEventOut,
    OrderFileOut,
    OrderOut,
    OrderPartyOut,
    OrderSupplierOut,
    StatusGroup,
)
from app.modules.organizations.models import Organization
from app.modules.payments.models import OrderPayment
from app.modules.quotations.models import Quotation
from app.modules.rfqs.models import Rfq
from app.modules.suppliers.models import Supplier

ORDER_NOT_FOUND = "سفارش موردنظر پیدا نشد."
NOT_YOUR_STEP = "این مرحله با طرف دیگر سفارش است."


def side_of(order: Order, user: CurrentUser) -> Side | None:
    if user.organization_id == order.buyer_organization_id:
        return "buyer"
    if user.organization_id == order.supplier_organization_id:
        return "supplier"
    if user.is_admin:
        return "admin"
    return None


async def create_for_award(
    db: AsyncSession, *, rfq: Rfq, quotation: Quotation, supplier: Supplier, actor: CurrentUser
) -> Order:
    """در همان تراکنش انتخاب برنده؛ اگر سفارش این RFQ از قبل باشد همان برگردانده می‌شود."""
    existing = await db.scalar(select(Order).where(Order.rfq_id == rfq.id))
    if existing is not None:
        return existing
    order = Order(
        id=uuid.uuid4(),
        rfq_id=rfq.id,
        quotation_id=quotation.id,
        buyer_organization_id=rfq.organization_id,
        supplier_organization_id=supplier.organization_id,
        supplier_id=supplier.id,
        title=rfq.title,
        material=rfq.material,
        quantity=rfq.quantity,
        delivery_city=rfq.delivery_city,
        amount_rials=quotation.total_price_rials,
        lead_time_days=quotation.lead_time_days,
        # پیش‌فرض: امروز + زمان تحویل پیشنهاد؛ پیش از امضای قرارداد قابل تغییر است (O5)
        delivery_due=business_today() + timedelta(days=quotation.lead_time_days),
        status="awaiting_contract",
    )
    db.add(order)
    await db.flush()
    record_event(db, order, "created", None, "awaiting_contract", actor, "buyer")
    audit.record(
        db,
        action="order.created",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=actor.id,
        organization_id=rfq.organization_id,
        data={"rfq_id": str(rfq.id), "quotation_id": str(quotation.id)},
    )
    return order


def record_event(
    db: AsyncSession,
    order: Order,
    action: str,
    from_status: str | None,
    to_status: str | None,
    actor: CurrentUser | None,
    side: str,
    note: str = "",
    file_id: uuid.UUID | None = None,
) -> None:
    db.add(
        OrderEvent(
            id=uuid.uuid4(),
            order_id=order.id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            actor_user_id=actor.id if actor else None,
            actor_side=side,
            note=note,
            file_id=file_id,
            created_at=utcnow(),
        )
    )


async def order_id_for_rfq(db: AsyncSession, rfq_id: uuid.UUID) -> uuid.UUID | None:
    return await db.scalar(select(Order.id).where(Order.rfq_id == rfq_id))


# --- خواندن ----------------------------------------------------------------------------------


def _select() -> Select[Any]:
    buyer_org = aliased(Organization)
    supplier_org = aliased(Organization)
    return (
        select(Order, buyer_org.name, supplier_org.name, Supplier.verified)
        .join(buyer_org, buyer_org.id == Order.buyer_organization_id)
        .join(supplier_org, supplier_org.id == Order.supplier_organization_id)
        .join(Supplier, Supplier.id == Order.supplier_id)
    )


def _out(
    order: Order, buyer_name: str, supplier_name: str, verified: bool, user: CurrentUser
) -> OrderOut:
    side = side_of(order, user)
    assert side is not None
    return OrderOut(
        id=order.id,
        number=order.number,
        status=order.status,
        title=order.title,
        material=order.material,
        quantity=order.quantity,
        delivery_city=order.delivery_city,
        amount_rials=order.amount_rials,
        lead_time_days=order.lead_time_days,
        delivery_due=order.delivery_due,
        is_overdue=lifecycle.is_overdue(order, business_today()),
        rfq_id=order.rfq_id,
        quotation_id=order.quotation_id,
        buyer=OrderPartyOut(organization_id=order.buyer_organization_id, name=buyer_name),
        supplier=OrderSupplierOut(
            organization_id=order.supplier_organization_id,
            supplier_id=order.supplier_id,
            name=supplier_name,
            verified=verified,
        ),
        my_side=side,
        next_actions=lifecycle.allowed_actions(order, side),
        created_at=order.created_at,
        updated_at=order.updated_at,
        shipped_at=order.shipped_at,
        delivered_at=order.delivered_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
        cancel_reason=order.cancel_reason,
    )


def _group_filter(group: StatusGroup) -> Any:
    if group == "completed":
        return Order.status == "completed"
    if group == "cancelled":
        return Order.status == "cancelled"
    if group == "active":
        return Order.status.not_in(("completed", "cancelled"))
    return None


async def list_orders(
    db: AsyncSession, user: CurrentUser, *, group: StatusGroup, limit: int, offset: int
) -> tuple[list[OrderOut], int]:
    stmt = _select()
    count = select(func.count()).select_from(Order)
    if not user.is_admin:
        mine = or_(
            Order.buyer_organization_id == user.organization_id,
            Order.supplier_organization_id == user.organization_id,
        )
        stmt = stmt.where(mine)
        count = count.where(mine)
    condition = _group_filter(group)
    if condition is not None:
        stmt = stmt.where(condition)
        count = count.where(condition)
    rows = (
        await db.execute(
            stmt.order_by(Order.created_at.desc(), Order.id.desc()).limit(limit).offset(offset)
        )
    ).all()
    total = await db.scalar(count) or 0
    return [_out(order, b, s, v, user) for order, b, s, v in rows], total


async def _events(db: AsyncSession, order_id: uuid.UUID) -> list[OrderEventOut]:
    rows = (
        await db.execute(
            select(OrderEvent, User.full_name, StoredFile)
            .outerjoin(User, User.id == OrderEvent.actor_user_id)
            .outerjoin(StoredFile, StoredFile.id == OrderEvent.file_id)
            .where(OrderEvent.order_id == order_id)
            .order_by(OrderEvent.created_at, OrderEvent.id)
        )
    ).all()
    return [
        OrderEventOut(
            id=event.id,
            action=event.action,
            from_status=event.from_status,
            to_status=event.to_status,
            actor_name=actor_name,
            actor_side=event.actor_side,
            note=event.note,
            file=OrderFileOut(
                id=stored.id, name=stored.original_name, size=stored.size_bytes, kind=stored.kind
            )
            if stored is not None
            else None,
            created_at=event.created_at,
        )
        for event, actor_name, stored in rows
    ]


async def load(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Order, Side]:
    """سفارش را با بررسی دسترسی برمی‌گرداند؛ برای هر سازمان دیگری 404."""
    stmt = select(Order).where(Order.id == order_id)
    if for_update:
        stmt = stmt.with_for_update()
    order = await db.scalar(stmt)
    side = side_of(order, user) if order is not None else None
    if order is None or side is None:
        raise NotFound(ORDER_NOT_FOUND)
    return order, side


async def get_order(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> OrderDetailOut:
    await load(db, user, order_id)
    row = (await db.execute(_select().where(Order.id == order_id))).one()
    order, buyer_name, supplier_name, verified = row
    base = _out(order, buyer_name, supplier_name, verified, user)
    return OrderDetailOut(**base.model_dump(), events=await _events(db, order.id))


# --- انتقال‌ها -------------------------------------------------------------------------------


async def attach_document(
    db: AsyncSession, user: CurrentUser, order: Order, file_id: uuid.UUID
) -> uuid.UUID:
    stored = await db.scalar(
        select(StoredFile)
        .where(
            StoredFile.id == file_id,
            StoredFile.organization_id == user.organization_id,
            StoredFile.purpose == "order_document",
        )
        .with_for_update()
    )
    if stored is None or stored.is_attached:
        raise field_error("fileId", "سند پیدا نشد یا قبلاً استفاده شده است؛ دوباره بارگذاری کنید.")
    stored.order_id = order.id
    return stored.id


async def transition(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    action: Action,
    *,
    note: str = "",
    reason: str | None = None,
    file_id: uuid.UUID | None = None,
) -> OrderDetailOut:
    order, side = await load(db, user, order_id, for_update=True)
    rule = lifecycle.TRANSITIONS[action]
    if side not in rule.sides:
        raise Forbidden(NOT_YOUR_STEP, code="not_your_step")
    if rule.already_done(order.status):
        # درخواست تکراری (مثلاً دوبار زدن دکمه یا تکرار شبکه): بی‌اثر و موفق
        return await get_order(db, user, order.id)
    if order.status not in rule.from_statuses:
        raise Conflict(rule.blocked, code="invalid_transition")

    previous = order.status
    now = utcnow()
    order.status = rule.to_status
    if action == "cancel":
        order.cancelled_at = now
        order.cancel_reason = reason
        note = reason or ""
    elif action == "ship":
        order.shipped_at = now
    elif action == "confirm_delivery":
        order.delivered_at = now
    attached = await attach_document(db, user, order, file_id) if file_id else None

    record_event(db, order, action, previous, rule.to_status, user, side, note, attached)
    if action == "confirm_delivery" and await all_paid(db, order.id):
        # همه‌ی اقساط پیش‌تر تأیید شده‌اند (مثلاً ۱۰۰٪ پیش‌پرداخت) ⇒ سفارش همین حالا تکمیل است
        order.status = "completed"
        order.completed_at = now
        record_event(db, order, "completed", rule.to_status, "completed", None, "system")
    audit.record(
        db,
        action=f"order.{action}",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"from": previous, "to": rule.to_status},
    )
    await db.commit()
    return await get_order(db, user, order.id)


async def all_paid(db: AsyncSession, order_id: uuid.UUID, *, also: uuid.UUID | None = None) -> bool:
    """آیا اقساط این سفارش ساخته شده و همه تأیید شده‌اند؟ (`also`: قسطی که در همین تراکنش
    تأیید می‌شود.) بدون اقساط پاسخ منفی است."""
    rows = (
        await db.execute(
            select(OrderPayment.id, OrderPayment.status).where(OrderPayment.order_id == order_id)
        )
    ).all()
    return bool(rows) and all(status == "confirmed" or pid == also for pid, status in rows)


async def orders_for_quotations(
    db: AsyncSession, quotation_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """شناسه‌ی سفارش هر پیشنهاد برنده (برای «پیشنهادهای من»)."""
    if not quotation_ids:
        return {}
    rows = await db.execute(
        select(Order.quotation_id, Order.id).where(Order.quotation_id.in_(quotation_ids))
    )
    return dict(rows.tuples().all())
