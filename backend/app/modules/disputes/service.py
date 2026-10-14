"""صف اختلاف‌ها برای ادمین (O11): فهرست، و تصمیم با دلیل.

پول از پلتفرم عبور نمی‌کند؛ تصمیم فقط وضعیت سفارش در پلتفرم را تعیین می‌کند:
- resume: سفارش از همان مرحله‌ی پیش از اختلاف ادامه می‌یابد؛
- complete: سفارش تکمیل‌شده ثبت می‌شود؛
- cancel: سفارش لغو می‌شود (دلیل تصمیم، دلیل لغو است).

ترتیب قفل مثل بقیه‌ی سفارش: اول ردیف سفارش، بعد ردیف اختلاف.
"""

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import Conflict, NotFound
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.disputes.models import OrderDispute
from app.modules.disputes.schemas import (
    AdminDisputeOut,
    AdminDisputePage,
    DisputeStatus,
    ResolveDisputeInput,
)
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.orders import service as orders
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderFileOut
from app.modules.organizations.models import Organization
from app.modules.suppliers import track_record

NOT_FOUND = "اختلاف موردنظر پیدا نشد."
RESOLUTION_LABELS = {
    "resume": "ادامه‌ی سفارش",
    "complete": "تکمیل سفارش",
    "cancel": "لغو سفارش",
}


def _select():  # type: ignore[no-untyped-def]
    buyer_org = aliased(Organization)
    supplier_org = aliased(Organization)
    opener = aliased(User)
    resolver = aliased(User)
    return (
        select(
            OrderDispute,
            Order,
            buyer_org.name,
            supplier_org.name,
            opener.full_name,
            resolver.full_name,
            StoredFile,
        )
        .join(Order, Order.id == OrderDispute.order_id)
        .join(buyer_org, buyer_org.id == Order.buyer_organization_id)
        .join(supplier_org, supplier_org.id == Order.supplier_organization_id)
        .join(opener, opener.id == OrderDispute.opened_by_id)
        .outerjoin(resolver, resolver.id == OrderDispute.resolved_by_id)
        .outerjoin(StoredFile, StoredFile.id == OrderDispute.file_id)
    )


def _items(rows: Sequence[Any]) -> list[AdminDisputeOut]:
    return [
        AdminDisputeOut(
            id=dispute.id,
            order_id=order.id,
            order_number=order.number,
            order_title=order.title,
            order_status=order.status,
            amount_rials=order.amount_rials,
            buyer_name=buyer_name,
            supplier_name=supplier_name,
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
            status=dispute.status,
            resolution=dispute.resolution,
            decision_reason=dispute.decision_reason,
            resolved_by_name=resolved_by,
            resolved_at=dispute.resolved_at,
        )
        for dispute, order, buyer_name, supplier_name, opened_by, resolved_by, stored in rows
    ]


async def list_disputes(
    db: AsyncSession, *, status: DisputeStatus | None, limit: int, offset: int
) -> AdminDisputePage:
    stmt = _select()
    count = select(func.count()).select_from(OrderDispute)
    if status:
        stmt = stmt.where(OrderDispute.status == status)
        count = count.where(OrderDispute.status == status)
    # صف «باز»: قدیمی‌ترین اول (به نوبت)؛ بقیه: تازه‌ترین اول
    order_by = (
        (OrderDispute.opened_at, OrderDispute.id)
        if status == "open"
        else (OrderDispute.opened_at.desc(), OrderDispute.id.desc())
    )
    rows = (await db.execute(stmt.order_by(*order_by).limit(limit).offset(offset))).all()
    total = await db.scalar(count) or 0
    return AdminDisputePage(items=_items(rows), total=total, limit=limit, offset=offset)


async def _one(db: AsyncSession, dispute_id: uuid.UUID) -> AdminDisputeOut:
    rows = (await db.execute(_select().where(OrderDispute.id == dispute_id))).all()
    if not rows:
        raise NotFound(NOT_FOUND)
    return _items(rows)[0]


async def resolve(
    db: AsyncSession, admin: CurrentUser, dispute_id: uuid.UUID, data: ResolveDisputeInput
) -> AdminDisputeOut:
    order_id = await db.scalar(select(OrderDispute.order_id).where(OrderDispute.id == dispute_id))
    if order_id is None:
        raise NotFound(NOT_FOUND)
    order, _ = await orders.load(db, admin, order_id, for_update=True)
    dispute = await db.scalar(
        select(OrderDispute)
        .where(OrderDispute.id == dispute_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert dispute is not None
    if dispute.status != "open":
        raise Conflict("این اختلاف قبلاً بررسی شده است.", code="already_decided")

    now = utcnow()
    if data.resolution == "resume":
        order.status = dispute.previous_status
    elif data.resolution == "complete":
        order.status = "completed"
        order.completed_at = now
    else:
        order.status = "cancelled"
        order.cancelled_at = now
        order.cancel_reason = data.reason[:500]
    dispute.status = "resolved"
    dispute.resolution = data.resolution
    dispute.decision_reason = data.reason
    dispute.resolved_by_id = admin.id
    dispute.resolved_at = now
    label = RESOLUTION_LABELS[data.resolution]
    orders.record_event(
        db,
        order,
        "dispute_resolved",
        "disputed",
        order.status,
        admin,
        "admin",
        f"{label}: {data.reason}",
    )
    for party in ("buyer", "supplier"):
        await orders.notify_side(
            db,
            order,
            party,
            admin,
            kind="dispute_resolved",
            title=f"پشتیبانی درباره‌ی سفارش {orders.ref(order)} تصمیم گرفت: {label}",
            body=data.reason,
        )
    if order.status == "completed":
        await track_record.refresh(db, order.supplier_id)
    audit.record(
        db,
        action="dispute.resolved",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=admin.id,
        organization_id=order.buyer_organization_id,
        data={"dispute_id": str(dispute.id), "resolution": data.resolution},
    )
    await db.commit()
    return await _one(db, dispute.id)
