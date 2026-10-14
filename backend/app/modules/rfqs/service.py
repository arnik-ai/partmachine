import uuid

from sqlalchemy import Subquery, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.quotations.models import Quotation
from app.modules.rfqs.models import Rfq
from app.modules.rfqs.policies import RfqView, is_owner, rfq_view
from app.modules.rfqs.schemas import CreateRfqInput, RfqOut
from app.modules.suppliers.service import supplier_for_organization

RFQ_NOT_FOUND = "درخواست موردنظر پیدا نشد."


def to_out(rfq: Rfq, user: CurrentUser, view: RfqView, quotations_count: int | None) -> RfqOut:
    full = view is RfqView.FULL
    return RfqOut.model_validate(
        {
            "id": rfq.id,
            "title": rfq.title,
            "description": rfq.description,
            "capability": rfq.capability,
            "material": rfq.material,
            "quantity": rfq.quantity,
            "delivery_city": rfq.delivery_city,
            "deadline": rfq.deadline,
            "status": rfq.status,
            "files": rfq.files if full else [],
            "quotations_count": quotations_count if full else None,
            "created_at": rfq.created_at,
            "is_owner": is_owner(rfq, user),
            "awarded_quotation_id": rfq.awarded_quotation_id if full else None,
        }
    )


def _quotation_counts() -> Subquery:
    return (
        select(Quotation.rfq_id, func.count(Quotation.id).label("n"))
        .group_by(Quotation.rfq_id)
        .subquery()
    )


async def create_rfq(db: AsyncSession, user: CurrentUser, data: CreateRfqInput) -> RfqOut:
    rfq = Rfq(
        id=uuid.uuid4(),
        organization_id=user.organization_id,
        created_by_id=user.id,
        title=data.title,
        description=data.description,
        capability=data.capability,
        material=data.material,
        quantity=data.quantity,
        delivery_city=data.delivery_city,
        deadline=data.deadline,
        status="published",
        files=[f.model_dump() for f in data.files],
    )
    db.add(rfq)
    audit.record(
        db,
        action="rfq.created",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"capability": rfq.capability, "quantity": rfq.quantity},
    )
    await db.commit()
    return to_out(rfq, user, RfqView.FULL, 0)


async def list_organization_rfqs(
    db: AsyncSession, user: CurrentUser, *, limit: int, offset: int
) -> tuple[list[RfqOut], int]:
    counts = _quotation_counts()
    base = select(Rfq).where(Rfq.organization_id == user.organization_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.execute(
        select(Rfq, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.rfq_id == Rfq.id)
        .where(Rfq.organization_id == user.organization_id)
        .order_by(Rfq.created_at.desc(), Rfq.id)
        .limit(limit)
        .offset(offset)
    )
    return [to_out(rfq, user, RfqView.FULL, int(n)) for rfq, n in rows.all()], total


async def has_quoted(db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID) -> bool:
    if user.role != "supplier":
        return False
    supplier = await supplier_for_organization(db, user.organization_id)
    if supplier is None:
        return False
    found = await db.scalar(
        select(Quotation.id).where(Quotation.rfq_id == rfq_id, Quotation.supplier_id == supplier.id)
    )
    return found is not None


async def load_visible(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Rfq, RfqView]:
    """RFQ را با بررسی دسترسی برمی‌گرداند؛ اگر کاربر اجازه‌ی دیدن ندارد 404 می‌دهد."""
    stmt = select(Rfq).where(Rfq.id == rfq_id)
    if for_update:
        stmt = stmt.with_for_update()
    rfq = await db.scalar(stmt)
    if rfq is None:
        raise NotFound(RFQ_NOT_FOUND)
    view = rfq_view(rfq, user, has_quoted=await has_quoted(db, user, rfq.id))
    if view is RfqView.NONE:
        raise NotFound(RFQ_NOT_FOUND)
    return rfq, view


async def get_rfq(db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID) -> RfqOut:
    rfq, view = await load_visible(db, user, rfq_id)
    count = None
    if view is RfqView.FULL:
        count = await db.scalar(select(func.count(Quotation.id)).where(Quotation.rfq_id == rfq.id))
    return to_out(rfq, user, view, count)
