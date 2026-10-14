"""آمار داشبورد از داده‌ی واقعی، برای هر نقش فقط از داده‌های سازمان خود کاربر (ادمین: کل سامانه)."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import RFQ_CREATOR_ROLES
from app.core.time import business_today
from app.modules.admin.service import MANUALLY_VERIFIED_ROLES
from app.modules.dashboard.schemas import DashboardOut, StatKey, StatOut
from app.modules.disputes.models import OrderDispute
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.inspections.models import OrderInspection
from app.modules.orders.models import Order
from app.modules.quotations.models import Quotation
from app.modules.rfqs.models import OPEN_STATUSES, Rfq
from app.modules.suppliers.models import Supplier
from app.modules.verification.models import VerificationRequest

CLOSED_ORDER_STATUSES = ("completed", "cancelled")


async def _count(db: AsyncSession, stmt: Any) -> int:
    return await db.scalar(stmt) or 0


def _orders(*conditions: Any) -> Any:
    return select(func.count()).select_from(Order).where(*conditions)


async def _order_stats(db: AsyncSession, side_column: Any, user: CurrentUser) -> list[StatOut]:
    mine = side_column == user.organization_id
    return [
        StatOut(
            key="active_orders",
            value=await _count(db, _orders(mine, Order.status.not_in(CLOSED_ORDER_STATUSES))),
        ),
        StatOut(
            key="completed_orders",
            value=await _count(db, _orders(mine, Order.status == "completed")),
        ),
    ]


async def _buyer(db: AsyncSession, user: CurrentUser) -> list[StatOut]:
    open_mine = (Rfq.organization_id == user.organization_id, Rfq.status.in_(OPEN_STATUSES))
    stats = [
        StatOut(
            key="open_rfqs",
            value=await _count(db, select(func.count()).select_from(Rfq).where(*open_mine)),
        ),
        StatOut(
            key="quotes_received",
            value=await _count(
                db,
                select(func.count())
                .select_from(Quotation)
                .join(Rfq, Rfq.id == Quotation.rfq_id)
                .where(*open_mine, Quotation.status == "active"),
            ),
        ),
    ]
    return stats + await _order_stats(db, Order.buyer_organization_id, user)


async def _supplier(db: AsyncSession, user: CurrentUser) -> list[StatOut]:
    market = await _count(
        db,
        select(func.count())
        .select_from(Rfq)
        .where(
            Rfq.status.in_(OPEN_STATUSES),
            Rfq.quotes_due >= business_today(),
            Rfq.organization_id != user.organization_id,
        ),
    )
    active_quotes = await _count(
        db,
        select(func.count())
        .select_from(Quotation)
        .join(Supplier, Supplier.id == Quotation.supplier_id)
        .join(Rfq, Rfq.id == Quotation.rfq_id)
        .where(
            Supplier.organization_id == user.organization_id,
            Quotation.status == "active",
            Rfq.status.in_(OPEN_STATUSES),
        ),
    )
    stats = [
        StatOut(key="open_market_rfqs", value=market),
        StatOut(key="active_quotes", value=active_quotes),
    ]
    return stats + await _order_stats(db, Order.supplier_organization_id, user)


async def _lab(db: AsyncSession, user: CurrentUser) -> list[StatOut]:
    def inspections(*statuses: str) -> Any:
        return (
            select(func.count())
            .select_from(OrderInspection)
            .where(
                OrderInspection.lab_organization_id == user.organization_id,
                OrderInspection.status.in_(statuses),
            )
        )

    keys: list[tuple[StatKey, tuple[str, ...]]] = [
        ("inspections_waiting", ("requested", "failed")),
        ("inspections_ready", ("ready",)),
        ("inspections_passed", ("passed",)),
    ]
    return [StatOut(key=key, value=await _count(db, inspections(*s))) for key, s in keys]


async def _admin(db: AsyncSession) -> list[StatOut]:
    return [
        StatOut(
            key="pending_verifications",
            value=await _count(
                db,
                select(func.count())
                .select_from(VerificationRequest)
                .where(VerificationRequest.status == "pending"),
            ),
        ),
        StatOut(
            key="open_disputes",
            value=await _count(
                db,
                select(func.count()).select_from(OrderDispute).where(OrderDispute.status == "open"),
            ),
        ),
        StatOut(
            key="unverified_accounts",
            value=await _count(
                db,
                select(func.count())
                .select_from(User)
                .where(
                    User.role.in_(MANUALLY_VERIFIED_ROLES),
                    User.is_verified.is_(False),
                    User.is_active.is_(True),
                ),
            ),
        ),
        StatOut(
            key="active_orders",
            value=await _count(db, _orders(Order.status.not_in(CLOSED_ORDER_STATUSES))),
        ),
        StatOut(
            key="active_users",
            value=await _count(
                db,
                select(func.count())
                .select_from(User)
                .where(User.is_active.is_(True), User.role != "admin"),
            ),
        ),
    ]


async def get_dashboard(db: AsyncSession, user: CurrentUser) -> DashboardOut:
    if user.is_admin:
        stats = await _admin(db)
    elif user.role == "supplier":
        stats = await _supplier(db, user)
    elif user.role == "qc":
        stats = await _lab(db, user)
    elif user.role in RFQ_CREATOR_ROLES:
        stats = await _buyer(db, user)
    else:
        stats = []
    return DashboardOut(stats=stats)
