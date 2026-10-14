"""سفارش: ساخت خودکار پس از انتخاب برنده (O1)، فهرست و جزئیات برای دو طرف، و انتقال‌های
چرخه‌ی وضعیت با قفل ردیف، تاریخچه و audit.

دسترسی: دو سازمان طرف سفارش و ادمین. آزمایشگاهی که کارفرما برای بازرسی انتخاب کرده (3d) فقط
با `allow_lab=True` راه می‌یابد: خود سفارش (بدون مبلغ)، رویدادهای بازرسی و بخش بازرسی؛ قرارداد،
پرداخت‌ها و اسناد دیگر برایش 404 است."""

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
from app.modules.disputes.models import OrderDispute
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.inspections.models import OrderInspection
from app.modules.notifications import service as notifications
from app.modules.orders import lifecycle
from app.modules.orders.lifecycle import Action, Side
from app.modules.orders.models import Order, OrderEvent
from app.modules.orders.schemas import (
    CancelRequestOut,
    OrderDetailOut,
    OrderDisputeOut,
    OrderEventOut,
    OrderFileOut,
    OrderInspectionSummaryOut,
    OrderOut,
    OrderPartyOut,
    OrderRatingOut,
    OrderSupplierOut,
    StatusGroup,
)
from app.modules.organizations.models import Organization
from app.modules.payments.models import OrderPayment
from app.modules.quotations.models import Quotation
from app.modules.ratings.models import OrderRating
from app.modules.rfqs.models import Rfq
from app.modules.suppliers import track_record
from app.modules.suppliers.models import Supplier

ORDER_NOT_FOUND = "سفارش موردنظر پیدا نشد."
NOT_YOUR_STEP = "این مرحله با طرف دیگر سفارش است."
REASON_REQUIRED = "دلیل لغو را بنویسید؛ طرف مقابل آن را می‌بیند."
SIDE_NAMES = {"buyer": "کارفرما", "supplier": "قطعه‌ساز"}
INSPECTION_REQUIRED = (
    "این سفارش بازرسی کیفیت دارد و ارسال فقط پس از قبولی بازرسی ممکن است. ابتدا آمادگی برای "
    "بازرسی را اعلام کنید."
)
# رویدادهایی که آزمایشگاه در تاریخچه می‌بیند (نه پرداخت، نه قرارداد)
LAB_EVENTS = (
    "inspection_requested",
    "inspection_lab_changed",
    "inspection_ready",
    "inspection_passed",
    "inspection_failed",
)


def side_of(
    order: Order, user: CurrentUser, lab_organization_id: uuid.UUID | None = None
) -> Side | None:
    if user.organization_id == order.buyer_organization_id:
        return "buyer"
    if user.organization_id == order.supplier_organization_id:
        return "supplier"
    if lab_organization_id is not None and user.organization_id == lab_organization_id:
        return "qc"
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


def ref(order: Order) -> str:
    """شماره‌ی خوانای سفارش، همان که کاربران می‌بینند (PM-1001)."""
    return f"PM-{order.number}"


def other_side(side: Side) -> Side:
    return "supplier" if side == "buyer" else "buyer"


async def notify_side(
    db: AsyncSession,
    order: Order,
    side: Side,
    actor: CurrentUser | None,
    *,
    kind: str,
    title: str,
    body: str = "",
    link_suffix: str = "",
) -> None:
    """اعلان برای اعضای یکی از دو طرف سفارش (در تراکنش فراخواننده)."""
    await notifications.notify(
        db,
        organization_id=order.buyer_organization_id
        if side == "buyer"
        else order.supplier_organization_id,
        kind=kind,
        title=title,
        body=body,
        link=f"/orders/{order.id}{link_suffix}",
        exclude_user_id=actor.id if actor else None,
    )


async def order_id_for_rfq(db: AsyncSession, rfq_id: uuid.UUID) -> uuid.UUID | None:
    return await db.scalar(select(Order.id).where(Order.rfq_id == rfq_id))


# --- خواندن ----------------------------------------------------------------------------------


def _select() -> Select[Any]:
    buyer_org = aliased(Organization)
    supplier_org = aliased(Organization)
    lab_org = aliased(Organization)
    return (
        select(
            Order,
            buyer_org.name,
            supplier_org.name,
            Supplier.verified,
            OrderInspection.status,
            OrderInspection.lab_organization_id,
            lab_org.name,
        )
        .join(buyer_org, buyer_org.id == Order.buyer_organization_id)
        .join(supplier_org, supplier_org.id == Order.supplier_organization_id)
        .join(Supplier, Supplier.id == Order.supplier_id)
        .outerjoin(OrderInspection, OrderInspection.order_id == Order.id)
        .outerjoin(lab_org, lab_org.id == OrderInspection.lab_organization_id)
    )


def _out(row: Any, user: CurrentUser) -> OrderOut:
    order, buyer_name, supplier_name, verified, inspection_status, lab_id, lab_name = row
    side = side_of(order, user, lab_id)
    assert side is not None
    return OrderOut(
        id=order.id,
        number=order.number,
        status=order.status,
        title=order.title,
        material=order.material,
        quantity=order.quantity,
        delivery_city=order.delivery_city,
        amount_rials=None if side == "qc" else order.amount_rials,
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
        next_actions=lifecycle.allowed_actions(order, side, inspection_status),
        inspection=OrderInspectionSummaryOut(
            status=inspection_status,
            lab=OrderPartyOut(organization_id=lab_id, name=lab_name),
        )
        if inspection_status is not None
        else None,
        cancel_request=CancelRequestOut(
            side=order.cancel_requested_side,
            reason=order.cancel_request_reason or "",
            requested_at=order.cancel_requested_at,
        )
        if order.cancel_requested_side is not None
        and order.cancel_requested_at is not None
        and order.status in lifecycle.SIGNED_OPEN
        and side != "qc"
        else None,
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
    count = (
        select(func.count())
        .select_from(Order)
        .outerjoin(OrderInspection, OrderInspection.order_id == Order.id)
    )
    if not user.is_admin:
        mine = or_(
            Order.buyer_organization_id == user.organization_id,
            Order.supplier_organization_id == user.organization_id,
            OrderInspection.lab_organization_id == user.organization_id,
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
    return [_out(row, user) for row in rows], total


async def _events(
    db: AsyncSession, order_id: uuid.UUID, *, lab_organization_id: uuid.UUID | None = None
) -> list[OrderEventOut]:
    """تاریخچه‌ی سفارش؛ برای آزمایشگاه فقط رویدادهای بازرسی و فقط سندهای خود آزمایشگاه."""
    stmt = (
        select(OrderEvent, User.full_name, StoredFile)
        .outerjoin(User, User.id == OrderEvent.actor_user_id)
        .outerjoin(StoredFile, StoredFile.id == OrderEvent.file_id)
        .where(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at, OrderEvent.id)
    )
    if lab_organization_id is not None:
        stmt = stmt.where(OrderEvent.action.in_(LAB_EVENTS))
    rows = (await db.execute(stmt)).all()
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
            and (lab_organization_id is None or stored.organization_id == lab_organization_id)
            else None,
            created_at=event.created_at,
        )
        for event, actor_name, stored in rows
    ]


async def lab_of(db: AsyncSession, order_id: uuid.UUID) -> uuid.UUID | None:
    """سازمان آزمایشگاهِ بازرسی این سفارش (اگر کارفرما انتخاب کرده باشد)."""
    return await db.scalar(
        select(OrderInspection.lab_organization_id).where(OrderInspection.order_id == order_id)
    )


async def inspection_status(db: AsyncSession, order_id: uuid.UUID) -> str | None:
    return await db.scalar(
        select(OrderInspection.status).where(OrderInspection.order_id == order_id)
    )


async def lab_has_rfq(db: AsyncSession, organization_id: uuid.UUID, rfq_id: uuid.UUID) -> bool:
    """آیا این سازمان آزمایشگاهِ بازرسی سفارشِ همین RFQ است؟ (برای دانلود نقشه‌ها پس از NDA)"""
    found = await db.scalar(
        select(OrderInspection.id)
        .join(Order, Order.id == OrderInspection.order_id)
        .where(Order.rfq_id == rfq_id, OrderInspection.lab_organization_id == organization_id)
    )
    return found is not None


async def load(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    *,
    for_update: bool = False,
    allow_lab: bool = False,
) -> tuple[Order, Side]:
    """سفارش را با بررسی دسترسی برمی‌گرداند؛ برای هر سازمان دیگری 404.

    آزمایشگاه بازرسی فقط با `allow_lab=True` پذیرفته می‌شود (سفارش و بخش بازرسی)؛ قرارداد،
    پرداخت‌ها و اسناد سفارش با مقدار پیش‌فرض برایش 404 می‌دهند.
    """
    stmt = select(Order).where(Order.id == order_id)
    if for_update:
        stmt = stmt.with_for_update()
    order = await db.scalar(stmt)
    if order is None:
        raise NotFound(ORDER_NOT_FOUND)
    lab = None
    if allow_lab and user.organization_id not in (
        order.buyer_organization_id,
        order.supplier_organization_id,
    ):
        lab = await lab_of(db, order.id)
    side = side_of(order, user, lab)
    if side is None:
        raise NotFound(ORDER_NOT_FOUND)
    return order, side


async def get_order(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> OrderDetailOut:
    _, side = await load(db, user, order_id, allow_lab=True)
    base = _out((await db.execute(_select().where(Order.id == order_id))).one(), user)
    lab = user.organization_id if side == "qc" else None
    events = await _events(db, order_id, lab_organization_id=lab)
    dispute = await _open_dispute(db, order_id) if side != "qc" else None
    rating = await _rating(db, order_id) if side != "qc" else None
    return OrderDetailOut(
        **base.model_dump(),
        events=events,
        dispute=dispute,
        rating=rating,
        can_rate=side == "buyer" and base.status == "completed",
    )


async def _rating(db: AsyncSession, order_id: uuid.UUID) -> OrderRatingOut | None:
    row = (
        await db.execute(
            select(OrderRating, User.full_name)
            .outerjoin(User, User.id == OrderRating.rated_by_id)
            .where(OrderRating.order_id == order_id)
        )
    ).first()
    if row is None:
        return None
    rating, rated_by = row
    return OrderRatingOut(
        score=rating.score,
        comment=rating.comment,
        rated_by_name=rated_by,
        updated_at=rating.updated_at,
    )


async def _open_dispute(db: AsyncSession, order_id: uuid.UUID) -> OrderDisputeOut | None:
    row = (
        await db.execute(
            select(OrderDispute, User.full_name, StoredFile)
            .join(User, User.id == OrderDispute.opened_by_id)
            .outerjoin(StoredFile, StoredFile.id == OrderDispute.file_id)
            .where(OrderDispute.order_id == order_id, OrderDispute.status == "open")
        )
    ).first()
    if row is None:
        return None
    dispute, opened_by, stored = row
    return OrderDisputeOut(
        id=dispute.id,
        opened_side=dispute.opened_side,
        opened_by_name=opened_by,
        reason=dispute.reason,
        file=OrderFileOut(
            id=stored.id, name=stored.original_name, size=stored.size_bytes, kind=stored.kind
        )
        if stored is not None
        else None,
        previous_status=dispute.previous_status,
        opened_at=dispute.opened_at,
    )


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
    order, side = await load(db, user, order_id, for_update=True, allow_lab=True)
    rule = lifecycle.TRANSITIONS[action]
    if side not in rule.sides:
        raise Forbidden(NOT_YOUR_STEP, code="not_your_step")
    if rule.already_done(order.status):
        # درخواست تکراری (مثلاً دوبار زدن دکمه یا تکرار شبکه): بی‌اثر و موفق
        return await get_order(db, user, order.id)
    if order.status not in rule.from_statuses:
        raise Conflict(rule.blocked, code="invalid_transition")
    if action == "ship" and not lifecycle.ship_ready(order, await inspection_status(db, order.id)):
        # ردیف سفارش قفل است و هر تغییر بازرسی هم اول همین ردیف را قفل می‌کند
        raise Conflict(INSPECTION_REQUIRED, code="inspection_required")
    if action == "cancel" and order.status != "awaiting_contract":
        return await _cancel_after_signing(db, user, order, side, reason or "")
    if action == "cancel" and len(reason or "") < 3:
        raise field_error("reason", REASON_REQUIRED)

    previous = order.status
    now = utcnow()
    attached = await attach_document(db, user, order, file_id) if file_id else None
    order.status = rule.to_status
    if action == "cancel":
        order.cancelled_at = now
        order.cancel_reason = reason
        note = reason or ""
    elif action == "ship":
        order.shipped_at = now
    elif action == "confirm_delivery":
        order.delivered_at = now
    elif action == "dispute":
        db.add(
            OrderDispute(
                id=uuid.uuid4(),
                order_id=order.id,
                opened_side=side,
                opened_by_id=user.id,
                reason=note,
                file_id=attached,
                previous_status=previous,
                opened_at=now,
                status="open",
            )
        )
        _clear_cancel_request(order)  # تصمیم با پشتیبانی است

    record_event(db, order, action, previous, rule.to_status, user, side, note, attached)
    if action == "confirm_delivery" and await all_paid(db, order.id):
        # همه‌ی اقساط پیش‌تر تأیید شده‌اند (مثلاً ۱۰۰٪ پیش‌پرداخت) ⇒ سفارش همین حالا تکمیل است
        order.status = "completed"
        order.completed_at = now
        record_event(db, order, "completed", rule.to_status, "completed", None, "system")
    await _notify_transition(db, order, action, side, user, note)
    if order.status == "completed" or (action == "dispute" and side == "buyer"):
        await track_record.refresh(db, order.supplier_id)  # سابقه‌ی واقعی قطعه‌ساز (O12)
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


def _clear_cancel_request(order: Order) -> None:
    order.cancel_requested_side = None
    order.cancel_requested_at = None
    order.cancel_request_reason = None


async def _cancel_after_signing(
    db: AsyncSession, user: CurrentUser, order: Order, side: Side, reason: str
) -> OrderDetailOut:
    """لغو پس از امضا فقط با توافق دو طرف (O11): درخواست یک طرف، موافقت طرف دیگر."""
    requested = order.cancel_requested_side
    if requested == side:
        return await get_order(db, user, order.id)  # درخواست تکراری: بی‌اثر
    other = other_side(side)
    if requested is None:
        if len(reason) < 3:
            raise field_error("reason", REASON_REQUIRED)
        order.cancel_requested_side = side
        order.cancel_requested_at = utcnow()
        order.cancel_request_reason = reason
        record_event(db, order, "cancel_requested", None, None, user, side, reason)
        await notify_side(
            db,
            order,
            other,
            user,
            kind="order_cancel_requested",
            title=f"{SIDE_NAMES[side]} درخواست لغو سفارش {ref(order)} را داده است",
            body=f"دلیل: {reason}. پس از امضای قرارداد، لغو فقط با موافقت شما انجام می‌شود.",
        )
        action = "order.cancel_requested"
    else:
        # طرف مقابل پیش‌تر درخواست داده بود ⇒ توافق دو طرف ⇒ لغو
        previous = order.status
        agreed = order.cancel_request_reason or ""
        order.status = "cancelled"
        order.cancelled_at = utcnow()
        order.cancel_reason = agreed
        record_event(
            db, order, "cancel", previous, "cancelled", user, side, f"با توافق دو طرف: {agreed}"
        )
        await notify_side(
            db,
            order,
            other,
            user,
            kind="order_cancel",
            title=f"سفارش {ref(order)} با توافق دو طرف لغو شد",
            body=f"دلیل: {agreed}",
        )
        action = "order.cancel"
    audit.record(
        db,
        action=action,
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"status": order.status, "mutual": True},
    )
    await db.commit()
    return await get_order(db, user, order.id)


async def keep_order(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, note: str
) -> OrderDetailOut:
    """ادامه‌ی سفارش: درخواست لغو پس گرفته یا پذیرفته‌نشده می‌شود (وضعیت عوض نمی‌شود)."""
    order, side = await load(db, user, order_id, for_update=True, allow_lab=True)
    if side not in ("buyer", "supplier"):
        raise Forbidden(NOT_YOUR_STEP, code="not_your_step")
    requested = order.cancel_requested_side
    if requested is None:
        return await get_order(db, user, order.id)  # درخواستی نمانده است: بی‌اثر
    withdrawn = requested == side
    _clear_cancel_request(order)
    record_event(
        db,
        order,
        "cancel_request_closed",
        None,
        None,
        user,
        side,
        note
        or ("درخواست لغو پس گرفته شد." if withdrawn else "با لغو موافقت نشد؛ سفارش ادامه دارد."),
    )
    await notify_side(
        db,
        order,
        other_side(side),
        user,
        kind="order_cancel_request_closed",
        title=f"درخواست لغو سفارش {ref(order)} پس گرفته شد"
        if withdrawn
        else f"{SIDE_NAMES[side]} با لغو سفارش {ref(order)} موافقت نکرد",
        body=note or "سفارش ادامه دارد. اگر مشکلی هست، «اعلام مشکل» کنید.",
    )
    audit.record(
        db,
        action="order.cancel_request_closed",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"withdrawn": withdrawn},
    )
    await db.commit()
    return await get_order(db, user, order.id)


async def _notify_transition(
    db: AsyncSession, order: Order, action: Action, side: Side, user: CurrentUser, note: str
) -> None:
    other = other_side(side)
    if action == "dispute":
        title = f"{SIDE_NAMES[side]} برای سفارش {ref(order)} مشکل اعلام کرد"
        body = f"{note} — سفارش تا تصمیم پشتیبانی پارت‌ماشین متوقف است."
        await notifications.notify_admins(
            db,
            kind="dispute_opened",
            title=f"اختلاف تازه در سفارش {ref(order)}",
            body=note,
            link="/admin/disputes",
        )
        await notify_side(db, order, other, user, kind="order_dispute", title=title, body=body)
        return
    if action == "cancel":
        title, body = f"سفارش {ref(order)} لغو شد", f"دلیل: {note}"
    elif action == "ship":
        title = f"سفارش {ref(order)} ارسال شد"
        body = note or "پس از دریافت و بررسی کالا، تحویل را تأیید کنید."
    elif order.status == "completed":
        title, body = f"سفارش {ref(order)} تحویل و تکمیل شد", note
    else:
        title = f"کارفرما تحویل سفارش {ref(order)} را تأیید کرد"
        body = note or "پس از دریافت تسویه‌ی پایانی، آن را در بخش «پرداخت‌ها» تأیید کنید."
    await notify_side(db, order, other, user, kind=f"order_{action}", title=title, body=body)


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
