"""RFQ: ثبت، فهرست‌ها (سازمان من و فید قطعه‌سازها)، جزئیات، لغو، تغییر مهلت و پذیرش NDA."""

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

from sqlalchemy import ColumnElement, Subquery, and_, false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, field_error
from app.core.text import escape_like, normalize_search, normalize_text
from app.core.time import business_today, utcnow
from app.modules.agreements import service as agreements
from app.modules.agreements.catalog import BUYER_ORDER, RFQ_NDA
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.audit import service as audit
from app.modules.files.models import StoredFile
from app.modules.identity.deps import ClientInfo, CurrentUser
from app.modules.orders import service as orders
from app.modules.quotations.models import Quotation
from app.modules.rfqs import lifecycle
from app.modules.rfqs.models import OPEN_STATUSES, Rfq
from app.modules.rfqs.policies import RfqView, can_manage, is_owner, rfq_view
from app.modules.rfqs.schemas import (
    QUOTES_DUE_AFTER_DEADLINE,
    CancelRfqInput,
    CreateRfqInput,
    MyQuotationRef,
    RescheduleRfqInput,
    RfqFileOut,
    RfqOut,
)
from app.modules.suppliers.service import supplier_for_organization

RFQ_NOT_FOUND = "درخواست موردنظر پیدا نشد."
DEFAULT_QUOTE_WINDOW = timedelta(days=7)
FeedSort = Literal["newest", "closing"]


@dataclass
class ViewerExtras:
    """بخش‌هایی از پاسخ که به بیننده بستگی دارد."""

    active_quotes: int = 0
    my_quotation: MyQuotationRef | None = None
    nda_accepted: bool | None = None
    file_count: int = 0
    # فهرست فایل‌ها فقط برای مالک، یا قطعه‌سازی که NDA همین RFQ را پذیرفته است
    files: list[RfqFileOut] = field(default_factory=list)
    order_id: uuid.UUID | None = None


def to_out(rfq: Rfq, user: CurrentUser, view: RfqView, extras: ViewerExtras, today: date) -> RfqOut:
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
            "quotes_due": rfq.quotes_due,
            "status": lifecycle.effective_status(
                rfq, active_quotes=extras.active_quotes, today=today, viewer_is_owner=full
            ),
            "files": extras.files,
            "file_count": extras.file_count,
            "quotations_count": extras.active_quotes if full else None,
            "created_at": rfq.created_at,
            "is_owner": is_owner(rfq, user),
            "awarded_quotation_id": rfq.awarded_quotation_id if full else None,
            "cancelled_at": rfq.cancelled_at,
            "cancel_reason": rfq.cancel_reason if full else None,
            "nda_accepted": extras.nda_accepted,
            "my_quotation": extras.my_quotation,
            "order_id": extras.order_id,
        }
    )


def active_counts() -> Subquery:
    """تعداد پیشنهادهای فعال (پس‌گرفته‌نشده) هر RFQ."""
    return (
        select(Quotation.rfq_id, func.count(Quotation.id).label("n"))
        .where(Quotation.status == "active")
        .group_by(Quotation.rfq_id)
        .subquery()
    )


def file_counts() -> Subquery:
    """تعداد فایل‌های پیوست هر RFQ."""
    return (
        select(StoredFile.rfq_id, func.count(StoredFile.id).label("n"))
        .where(StoredFile.rfq_id.is_not(None))
        .group_by(StoredFile.rfq_id)
        .subquery()
    )


def _file_out(stored: StoredFile) -> RfqFileOut:
    return RfqFileOut(
        id=stored.id, name=stored.original_name, size=stored.size_bytes, kind=stored.kind
    )


async def rfq_files(db: AsyncSession, rfq_id: uuid.UUID) -> list[RfqFileOut]:
    rows = await db.scalars(
        select(StoredFile)
        .where(StoredFile.rfq_id == rfq_id)
        .order_by(StoredFile.created_at, StoredFile.id)
    )
    return [_file_out(f) for f in rows]


async def _attach_files(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, file_ids: list[uuid.UUID]
) -> list[RfqFileOut]:
    """فایل‌های بارگذاری‌شده‌ی همین سازمان را به RFQ پیوست می‌کند (هر فایل فقط یک‌بار)."""
    if not file_ids:
        return []
    wanted = set(file_ids)
    stored = (
        await db.scalars(select(StoredFile).where(StoredFile.id.in_(wanted)).with_for_update())
    ).all()
    if len(stored) != len(wanted) or any(
        f.organization_id != user.organization_id
        or f.purpose != "rfq_attachment"
        or f.rfq_id is not None
        for f in stored
    ):
        raise field_error(
            "fileIds",
            "یکی از فایل‌ها معتبر نیست یا قبلاً به درخواست دیگری پیوست شده است؛ "
            "آن را دوباره بارگذاری کنید.",
        )
    for f in stored:
        f.rfq_id = rfq_id
    return [_file_out(f) for f in sorted(stored, key=lambda f: (f.created_at, f.id))]


async def active_quote_count(db: AsyncSession, rfq_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count(Quotation.id)).where(
                Quotation.rfq_id == rfq_id, Quotation.status == "active"
            )
        )
        or 0
    )


async def create_rfq(
    db: AsyncSession, user: CurrentUser, data: CreateRfqInput, client: ClientInfo | None = None
) -> RfqOut:
    agreement = agreements.require_accepted(data.accepted_agreements, BUYER_ORDER.key)
    today = business_today()
    quotes_due = data.quotes_due or min(data.deadline, today + DEFAULT_QUOTE_WINDOW)
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
        quotes_due=quotes_due,
        status="published",
    )
    db.add(rfq)
    await db.flush()
    files = await _attach_files(db, user, rfq.id, data.file_ids)
    agreements.record(
        db,
        agreement=agreement,
        user_id=user.id,
        organization_id=user.organization_id,
        client=client,
        rfq_id=rfq.id,
    )
    audit.record(
        db,
        action="rfq.created",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={
            "capability": rfq.capability,
            "quantity": rfq.quantity,
            "quotes_due": quotes_due.isoformat(),
            "files": len(files),
        },
    )
    await db.commit()
    extras = ViewerExtras(file_count=len(files), files=files)
    return to_out(rfq, user, RfqView.FULL, extras, today)


async def list_organization_rfqs(
    db: AsyncSession, user: CurrentUser, *, limit: int, offset: int
) -> tuple[list[RfqOut], int]:
    today = business_today()
    counts = active_counts()
    files = file_counts()
    total = (
        await db.scalar(
            select(func.count(Rfq.id)).where(Rfq.organization_id == user.organization_id)
        )
        or 0
    )
    rows = await db.execute(
        select(Rfq, func.coalesce(counts.c.n, 0), func.coalesce(files.c.n, 0))
        .outerjoin(counts, counts.c.rfq_id == Rfq.id)
        .outerjoin(files, files.c.rfq_id == Rfq.id)
        .where(Rfq.organization_id == user.organization_id)
        .order_by(Rfq.created_at.desc(), Rfq.id)
        .limit(limit)
        .offset(offset)
    )
    items = [
        to_out(
            rfq, user, RfqView.FULL, ViewerExtras(active_quotes=int(n), file_count=int(f)), today
        )
        for rfq, n, f in rows.all()
    ]
    return items, total


async def list_open_rfqs(
    db: AsyncSession,
    user: CurrentUser,
    *,
    q: str | None,
    capability: str | None,
    city: str | None,
    sort: FeedSort,
    limit: int,
    offset: int,
) -> tuple[list[RfqOut], int]:
    """فید قطعه‌سازها: RFQهای سازمان‌های دیگر که هنوز پیشنهاد می‌پذیرند؛ فقط خلاصه."""
    today = business_today()
    conditions: list[ColumnElement[bool]] = [
        Rfq.status.in_(OPEN_STATUSES),
        Rfq.quotes_due >= today,
        Rfq.organization_id != user.organization_id,
    ]
    if capability:
        conditions.append(Rfq.capability == capability)
    if city:
        conditions.append(Rfq.delivery_city == normalize_text(city))
    if q and normalize_search(q):
        pattern = f"%{escape_like(normalize_search(q))}%"
        conditions.append(Rfq.search_text.like(pattern, escape="\\"))

    total = await db.scalar(select(func.count(Rfq.id)).where(*conditions)) or 0
    supplier = await supplier_for_organization(db, user.organization_id)
    mine_on = (
        and_(Quotation.rfq_id == Rfq.id, Quotation.supplier_id == supplier.id)
        if supplier
        else and_(Quotation.rfq_id == Rfq.id, false())
    )
    order: tuple[Any, ...] = (
        (Rfq.quotes_due.asc(), Rfq.created_at.desc())
        if sort == "closing"
        else (Rfq.created_at.desc(),)
    )
    files = file_counts()
    rows = await db.execute(
        select(Rfq, Quotation.id, Quotation.status, func.coalesce(files.c.n, 0))
        .outerjoin(Quotation, mine_on)
        .outerjoin(files, files.c.rfq_id == Rfq.id)
        .where(*conditions)
        .order_by(*order, Rfq.id)
        .limit(limit)
        .offset(offset)
    )
    items = []
    for rfq, quotation_id, quotation_status, file_count in rows.all():
        mine = MyQuotationRef(id=quotation_id, status=quotation_status) if quotation_id else None
        extras = ViewerExtras(my_quotation=mine, file_count=int(file_count))
        items.append(to_out(rfq, user, RfqView.SUMMARY, extras, today))
    return items, total


async def my_quotation(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID
) -> MyQuotationRef | None:
    if user.role != "supplier":
        return None
    supplier = await supplier_for_organization(db, user.organization_id)
    if supplier is None:
        return None
    row = (
        await db.execute(
            select(Quotation.id, Quotation.status).where(
                Quotation.rfq_id == rfq_id, Quotation.supplier_id == supplier.id
            )
        )
    ).first()
    return MyQuotationRef(id=row[0], status=row[1]) if row else None


async def _load(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Rfq, RfqView, MyQuotationRef | None]:
    stmt = select(Rfq).where(Rfq.id == rfq_id)
    if for_update:
        stmt = stmt.with_for_update()
    rfq = await db.scalar(stmt)
    if rfq is None:
        raise NotFound(RFQ_NOT_FOUND)
    mine = await my_quotation(db, user, rfq.id)
    view = rfq_view(rfq, user, has_quoted=mine is not None, today=business_today())
    if view is RfqView.NONE:
        raise NotFound(RFQ_NOT_FOUND)
    return rfq, view, mine


async def load_visible(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Rfq, RfqView]:
    """RFQ را با بررسی دسترسی برمی‌گرداند؛ اگر کاربر اجازه‌ی دیدن ندارد 404 می‌دهد."""
    rfq, view, _ = await _load(db, user, rfq_id, for_update=for_update)
    return rfq, view


async def _load_managed(db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID) -> Rfq:
    """RFQ قفل‌شده برای مالک یا ادمین؛ برای بقیه 404."""
    rfq = await db.scalar(select(Rfq).where(Rfq.id == rfq_id).with_for_update())
    if rfq is None or not can_manage(rfq, user):
        raise NotFound(RFQ_NOT_FOUND)
    return rfq


async def get_rfq(db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID) -> RfqOut:
    rfq, view, mine = await _load(db, user, rfq_id)
    files = await rfq_files(db, rfq.id)
    extras = ViewerExtras(active_quotes=await active_quote_count(db, rfq.id), file_count=len(files))
    if view is RfqView.SUMMARY:
        extras.my_quotation = mine
        extras.nda_accepted = await agreements.has_accepted_rfq_nda(
            db, user.organization_id, rfq.id
        )
    if view is RfqView.FULL or extras.nda_accepted:
        extras.files = files
    is_winner = mine is not None and mine.id == rfq.awarded_quotation_id
    if rfq.status == "awarded" and (view is RfqView.FULL or is_winner):
        extras.order_id = await orders.order_id_for_rfq(db, rfq.id)
    return to_out(rfq, user, view, extras, business_today())


async def cancel_rfq(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, data: CancelRfqInput
) -> RfqOut:
    rfq = await _load_managed(db, user, rfq_id)
    if not lifecycle.can_cancel(rfq):
        raise Conflict("این درخواست دیگر قابل لغو نیست.", code="rfq_not_cancellable")
    rfq.status = "cancelled"
    rfq.cancelled_at = utcnow()
    rfq.cancel_reason = data.reason
    audit.record(
        db,
        action="rfq.cancelled",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"reason": data.reason} if data.reason else {},
    )
    await db.commit()
    return await get_rfq(db, user, rfq.id)


async def reschedule_rfq(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, data: RescheduleRfqInput
) -> RfqOut:
    rfq = await _load_managed(db, user, rfq_id)
    if not lifecycle.can_reschedule(rfq):
        raise Conflict(
            "مهلت درخواستی که برنده دارد یا لغو شده قابل تغییر نیست.",
            code="rfq_not_reschedulable",
        )
    deadline = data.deadline or rfq.deadline
    if data.quotes_due > deadline:
        raise field_error("quotesDue", QUOTES_DUE_AFTER_DEADLINE)
    previous = {"quotes_due": rfq.quotes_due.isoformat(), "deadline": rfq.deadline.isoformat()}
    rfq.quotes_due = data.quotes_due
    rfq.deadline = deadline
    audit.record(
        db,
        action="rfq.rescheduled",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={
            "previous": previous,
            "quotes_due": data.quotes_due.isoformat(),
            "deadline": deadline.isoformat(),
        },
    )
    await db.commit()
    return await get_rfq(db, user, rfq.id)


async def accept_nda(
    db: AsyncSession,
    user: CurrentUser,
    rfq_id: uuid.UUID,
    data: AcceptedAgreementIn,
    client: ClientInfo | None = None,
) -> RfqOut:
    """قطعه‌ساز NDA همین RFQ را از طرف سازمانش می‌پذیرد (یک‌بار برای هر سازمان)."""
    agreement = agreements.require_accepted([data], RFQ_NDA.key)
    rfq, view, _ = await _load(db, user, rfq_id)
    if view is RfqView.SUMMARY:
        # درخواست هم‌زمان عضو دیگری از همین سازمان: فقط یکی ثبت می‌شود، نتیجه برای هر دو یکی است
        recorded = await agreements.record_rfq_nda(
            db,
            user_id=user.id,
            organization_id=user.organization_id,
            rfq_id=rfq.id,
            client=client,
        )
        if recorded:
            audit.record(
                db,
                action="rfq.nda_accepted",
                entity_type="rfq",
                entity_id=rfq.id,
                actor_user_id=user.id,
                organization_id=user.organization_id,
                data={"version": agreement.version},
            )
        await db.commit()
    return await get_rfq(db, user, rfq.id)
