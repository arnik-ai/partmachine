"""کنترل کیفیت اختیاری سفارش (O9): انتخاب آزمایشگاه تأییدشده (کارفرما)، اعلام آمادگی برای
بازرسی (قطعه‌ساز)، و ثبت نتیجه با گزارش (آزمایشگاه).

- «آزمایشگاه تأییدشده» سازمانی است که ادمین حساب مدیرش را تأیید کرده است (همان روال فاز ۲).
- آزمایشگاه فقط سفارشی را می‌بیند که برایش انتخاب شده است؛ نقشه‌ها را پس از پذیرش تعهد عدم
  افشای مخصوص آزمایشگاه می‌بیند و مبلغ، پرداخت‌ها و قرارداد را هرگز نمی‌بیند.
- رد بازرسی سفارش را به «در حال تولید» برمی‌گرداند؛ تا قبولی، ارسال ممکن نیست
  (`orders.lifecycle.ship_ready`).

ترتیب قفل در همه‌ی تابع‌ها یکسان است: اول ردیف سفارش، بعد ردیف بازرسی.
"""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, Forbidden, field_error
from app.core.time import utcnow
from app.modules.agreements import service as agreements
from app.modules.agreements.catalog import INSPECTION_NDA
from app.modules.agreements.schemas import AcceptedAgreementIn
from app.modules.audit import service as audit
from app.modules.files.models import StoredFile
from app.modules.identity.deps import ClientInfo, CurrentUser
from app.modules.identity.models import User
from app.modules.inspections.models import OrderInspection
from app.modules.inspections.schemas import (
    ChooseLabInput,
    InspectionOut,
    InspectionResultInput,
    MarkReadyInput,
    QcLabList,
)
from app.modules.notifications import service as notifications
from app.modules.orders import service as orders
from app.modules.orders.lifecycle import Side
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderFileOut, OrderPartyOut
from app.modules.organizations.models import Organization
from app.modules.suppliers import track_record

# آزمایشگاه پیش از ارسال (و تا پیش از قبولی بازرسی) انتخاب، عوض یا حذف می‌شود
OPEN_FOR_CHOICE = frozenset(
    {"awaiting_contract", "awaiting_prepayment", "in_production", "in_inspection"}
)
MAX_LABS = 200

LAB_NOT_AVAILABLE = "این آزمایشگاه پیدا نشد یا هنوز توسط تراشینو تأیید نشده است."
CHOICE_CLOSED = "آزمایشگاه فقط پیش از ارسال و تا پیش از قبولی بازرسی قابل انتخاب، تغییر یا حذف است."
NOT_READY = (
    "سفارش هنوز آماده‌ی بازرسی نیست یا وضعیت بازرسی تغییر کرده است؛ صفحه را دوباره بارگذاری کنید."
)


def _verified_labs() -> Select[tuple[uuid.UUID, str]]:
    return (
        select(Organization.id, Organization.name)
        .join(User, User.organization_id == Organization.id)
        .where(
            User.org_role == "owner",
            User.role == "qc",
            User.is_verified.is_(True),
            User.is_active.is_(True),
        )
    )


async def list_labs(db: AsyncSession) -> QcLabList:
    rows = (
        await db.execute(
            _verified_labs().order_by(Organization.name, Organization.id).limit(MAX_LABS)
        )
    ).all()
    return QcLabList(items=[OrderPartyOut(organization_id=i, name=name) for i, name in rows])


async def _verified_lab(db: AsyncSession, organization_id: uuid.UUID) -> OrderPartyOut | None:
    row = (await db.execute(_verified_labs().where(Organization.id == organization_id))).first()
    return OrderPartyOut(organization_id=row[0], name=row[1]) if row is not None else None


async def _current(
    db: AsyncSession, order_id: uuid.UUID, *, for_update: bool = False
) -> OrderInspection | None:
    stmt = select(OrderInspection).where(OrderInspection.order_id == order_id)
    if for_update:
        stmt = stmt.with_for_update()
    return await db.scalar(stmt)


def _can_choose(order: Order, inspection: OrderInspection | None, side: Side) -> bool:
    return (
        side == "buyer"
        and order.status in OPEN_FOR_CHOICE
        and (inspection is None or inspection.status != "passed")
    )


def _can_mark_ready(order: Order, inspection: OrderInspection | None, side: Side) -> bool:
    return (
        side == "supplier"
        and inspection is not None
        and inspection.status in ("requested", "failed")
        and order.status == "in_production"
    )


def _file(stored: StoredFile) -> OrderFileOut:
    return OrderFileOut(
        id=stored.id, name=stored.original_name, size=stored.size_bytes, kind=stored.kind
    )


async def _out(
    db: AsyncSession,
    user: CurrentUser,
    order: Order,
    side: Side,
    inspection: OrderInspection | None,
) -> InspectionOut:
    if inspection is None:
        return InspectionOut(status="none", can_choose_lab=_can_choose(order, None, side))
    lab_name = await db.scalar(
        select(Organization.name).where(Organization.id == inspection.lab_organization_id)
    )
    result_by = (
        await db.scalar(select(User.full_name).where(User.id == inspection.result_by_id))
        if inspection.result_by_id
        else None
    )
    report = (
        await db.get(StoredFile, inspection.report_file_id) if inspection.report_file_id else None
    )
    if report is not None and side == "qc" and report.organization_id != user.organization_id:
        report = None  # گزارش آزمایشگاه قبلی (اگر کارفرما آزمایشگاه را عوض کرده باشد)
    out = InspectionOut(
        status=inspection.status,
        lab=OrderPartyOut(organization_id=inspection.lab_organization_id, name=lab_name or ""),
        attempt=inspection.attempt,
        requested_at=inspection.requested_at,
        ready_at=inspection.ready_at,
        result_at=inspection.result_at,
        result_by_name=result_by,
        result_note=inspection.result_note,
        report=_file(report) if report is not None else None,
        can_choose_lab=_can_choose(order, inspection, side),
        can_remove=_can_choose(order, inspection, side),
        can_mark_ready=_can_mark_ready(order, inspection, side),
    )
    if side == "qc":
        out.can_record_result = (
            inspection.status == "ready"
            and order.status == "in_inspection"
            and await _verified_lab(db, user.organization_id) is not None
        )
        files = list(
            await db.scalars(
                select(StoredFile)
                .where(StoredFile.rfq_id == order.rfq_id)
                .order_by(StoredFile.created_at, StoredFile.id)
            )
        )
        out.nda_accepted = await agreements.has_accepted_rfq_nda(
            db, user.organization_id, order.rfq_id, agreement=INSPECTION_NDA
        )
        out.file_count = len(files)
        out.files = [_file(f) for f in files] if out.nda_accepted else []
    return out


async def get_inspection(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> InspectionOut:
    order, side = await orders.load(db, user, order_id, allow_lab=True)
    return await _out(db, user, order, side, await _current(db, order.id))


async def _notify_lab(
    db: AsyncSession,
    order: Order,
    lab_organization_id: uuid.UUID,
    *,
    kind: str,
    title: str,
    body: str = "",
    link: str | None = None,
) -> None:
    await notifications.notify(
        db,
        organization_id=lab_organization_id,
        kind=kind,
        title=title,
        body=body,
        link=f"/orders/{order.id}" if link is None else link,
    )


def _audit(db: AsyncSession, user: CurrentUser, order: Order, action: str, **data: object) -> None:
    audit.record(
        db,
        action=f"inspection.{action}",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={key: str(value) for key, value in data.items()},
    )


async def choose_lab(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: ChooseLabInput
) -> InspectionOut:
    order, side = await orders.load(db, user, order_id, for_update=True, allow_lab=True)
    if side != "buyer":
        raise Forbidden("انتخاب آزمایشگاه با کارفرما است.", code="not_your_step")
    inspection = await _current(db, order.id, for_update=True)
    if inspection is not None and inspection.lab_organization_id == data.lab_organization_id:
        return await _out(db, user, order, side, inspection)  # درخواست تکراری: بی‌اثر
    if not _can_choose(order, inspection, side):
        raise Conflict(CHOICE_CLOSED, code="inspection_locked")
    lab = await _verified_lab(db, data.lab_organization_id)
    if lab is None or lab.organization_id in (
        order.buyer_organization_id,
        order.supplier_organization_id,
    ):
        raise field_error("labOrganizationId", LAB_NOT_AVAILABLE)

    ref = orders.ref(order)
    if inspection is None:
        inspection = OrderInspection(
            id=uuid.uuid4(),
            order_id=order.id,
            lab_organization_id=lab.organization_id,
            status="requested",
            attempt=0,
            requested_by_id=user.id,
            requested_at=utcnow(),
        )
        db.add(inspection)
        action = "requested"
        await orders.notify_side(
            db,
            order,
            "supplier",
            user,
            kind="inspection_requested",
            title=f"کارفرما بازرسی کیفیت سفارش {ref} را خواست",
            body=f"آزمایشگاه: {lab.name}. ارسال پس از قبولی بازرسی ممکن است.",
        )
    else:
        # دور جاری (اگر قطعه‌ساز آمادگی را اعلام کرده باشد) با آزمایشگاه تازه ادامه می‌یابد
        await _notify_lab(
            db,
            order,
            inspection.lab_organization_id,
            kind="inspection_unassigned",
            title=f"بازرسی سفارش {ref} به آزمایشگاه دیگری سپرده شد",
            link="/orders",
        )
        inspection.lab_organization_id = lab.organization_id
        action = "lab_changed"
        await orders.notify_side(
            db,
            order,
            "supplier",
            user,
            kind="inspection_lab_changed",
            title=f"آزمایشگاه بازرسی سفارش {ref} تغییر کرد",
            body=f"آزمایشگاه تازه: {lab.name}",
        )
    await _notify_lab(
        db,
        order,
        lab.organization_id,
        kind="inspection_assigned",
        title=f"برای بازرسی سفارش {ref} انتخاب شدید",
        body=f"«{order.title}» — برای دیدن نقشه‌ها، تعهد عدم افشای این سفارش را بپذیرید.",
    )
    orders.record_event(db, order, f"inspection_{action}", None, None, user, side, lab.name)
    _audit(db, user, order, action, lab_organization_id=lab.organization_id)
    await db.commit()
    return await _out(db, user, order, side, inspection)


async def remove(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> InspectionOut:
    order, side = await orders.load(db, user, order_id, for_update=True, allow_lab=True)
    if side != "buyer":
        raise Forbidden("حذف بازرسی با کارفرما است.", code="not_your_step")
    inspection = await _current(db, order.id, for_update=True)
    if inspection is None:
        return await _out(db, user, order, side, None)  # درخواست تکراری: بی‌اثر
    if not _can_choose(order, inspection, side):
        raise Conflict(CHOICE_CLOSED, code="inspection_locked")
    lab_name = await db.scalar(
        select(Organization.name).where(Organization.id == inspection.lab_organization_id)
    )
    previous = order.status
    if order.status == "in_inspection":
        order.status = "in_production"  # بدون بازرسی، قطعه‌ساز مستقیم ارسال می‌کند
    changed = order.status != previous
    await db.delete(inspection)
    orders.record_event(
        db,
        order,
        "inspection_removed",
        previous if changed else None,
        order.status if changed else None,
        user,
        side,
        lab_name or "",
    )
    await _notify_lab(
        db,
        order,
        inspection.lab_organization_id,
        kind="inspection_unassigned",
        title=f"بازرسی سفارش {orders.ref(order)} لغو شد",
        body="کارفرما بازرسی کیفیت این سفارش را حذف کرد.",
        link="/orders",
    )
    await orders.notify_side(
        db,
        order,
        "supplier",
        user,
        kind="inspection_removed",
        title=f"کارفرما بازرسی کیفیت سفارش {orders.ref(order)} را حذف کرد",
        body="پس از آماده شدن، ارسال را مستقیم ثبت کنید.",
    )
    _audit(db, user, order, "removed", lab_organization_id=inspection.lab_organization_id)
    await db.commit()
    return await _out(db, user, order, side, None)


async def mark_ready(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: MarkReadyInput
) -> InspectionOut:
    order, side = await orders.load(db, user, order_id, for_update=True, allow_lab=True)
    if side != "supplier":
        raise Forbidden("اعلام آمادگی برای بازرسی با قطعه‌ساز است.", code="not_your_step")
    inspection = await _current(db, order.id, for_update=True)
    if inspection is None:
        raise Conflict(
            "کارفرما برای این سفارش بازرسی انتخاب نکرده است؛ پس از آماده شدن، ارسال را ثبت کنید.",
            code="no_inspection",
        )
    if inspection.status in ("ready", "passed"):
        return await _out(db, user, order, side, inspection)  # درخواست تکراری: بی‌اثر
    if order.status != "in_production":
        raise Conflict(
            "اعلام آمادگی برای بازرسی پس از امضای قرارداد و شروع تولید ممکن است.",
            code="invalid_transition",
        )
    inspection.status = "ready"
    inspection.attempt += 1
    inspection.ready_at = utcnow()
    order.status = "in_inspection"
    orders.record_event(
        db, order, "inspection_ready", "in_production", "in_inspection", user, side, data.note
    )
    await _notify_lab(
        db,
        order,
        inspection.lab_organization_id,
        kind="inspection_ready",
        title=f"سفارش {orders.ref(order)} آماده‌ی بازرسی است",
        body=data.note or f"دور {inspection.attempt} بازرسی",
    )
    await orders.notify_side(
        db,
        order,
        "buyer",
        user,
        kind="inspection_ready",
        title=f"قطعه‌ساز سفارش {orders.ref(order)} را آماده‌ی بازرسی اعلام کرد",
    )
    _audit(db, user, order, "ready", attempt=inspection.attempt)
    await db.commit()
    return await _out(db, user, order, side, inspection)


async def accept_nda(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    data: AcceptedAgreementIn,
    client: ClientInfo | None = None,
) -> InspectionOut:
    """آزمایشگاه تعهد عدم افشای این سفارش را از طرف سازمانش می‌پذیرد (یک‌بار برای هر سازمان)."""
    agreement = agreements.require_accepted([data], INSPECTION_NDA.key)
    order, side = await orders.load(db, user, order_id, allow_lab=True)
    if side != "qc":
        raise Forbidden("این تعهد مخصوص آزمایشگاه بازرسی همین سفارش است.", code="not_your_step")
    recorded = await agreements.record_rfq_nda(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        rfq_id=order.rfq_id,
        client=client,
        agreement=agreement,
    )
    if recorded:
        _audit(db, user, order, "nda_accepted", version=agreement.version)
    await db.commit()
    return await _out(db, user, order, side, await _current(db, order.id))


async def record_result(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: InspectionResultInput
) -> InspectionOut:
    order, side = await orders.load(db, user, order_id, for_update=True, allow_lab=True)
    if side != "qc":
        raise Forbidden("ثبت نتیجه‌ی بازرسی با آزمایشگاه است.", code="not_your_step")
    inspection = await _current(db, order.id, for_update=True)
    assert inspection is not None  # بیننده‌ی «آزمایشگاه» یعنی ردیف بازرسی هست
    if inspection.attempt == data.attempt and inspection.status in ("passed", "failed"):
        return await _out(db, user, order, side, inspection)  # درخواست تکراری: بی‌اثر
    if (
        inspection.status != "ready"
        or inspection.attempt != data.attempt
        or order.status != "in_inspection"
    ):
        raise Conflict(NOT_READY, code="inspection_not_ready")
    if await _verified_lab(db, user.organization_id) is None:
        raise Forbidden(
            "حساب آزمایشگاه شما در حال حاضر تأییدشده نیست؛ با پشتیبانی تراشینو تماس بگیرید.",
            code="lab_not_verified",
        )
    if not data.passed and len(data.note) < 3:
        raise field_error("note", "دلیل رد را بنویسید تا قطعه‌ساز بداند چه چیزی را اصلاح کند.")
    if data.file_id is None:
        raise field_error("fileId", "گزارش بازرسی (PDF یا تصویر) را بارگذاری کنید.")

    report = await orders.attach_document(db, user, order, data.file_id)
    inspection.status = "passed" if data.passed else "failed"
    inspection.result_at = utcnow()
    inspection.result_by_id = user.id
    inspection.result_note = data.note
    inspection.report_file_id = report
    previous = order.status
    if not data.passed:
        order.status = "in_production"  # قطعه‌ساز اصلاح می‌کند و دوباره آمادگی را اعلام می‌کند
    changed = order.status != previous
    orders.record_event(
        db,
        order,
        f"inspection_{inspection.status}",
        previous if changed else None,
        order.status if changed else None,
        user,
        side,
        data.note,
        report,
    )
    verdict = "قبول" if data.passed else "رد"
    for party in ("buyer", "supplier"):
        await orders.notify_side(
            db,
            order,
            party,
            user,
            kind=f"inspection_{inspection.status}",
            title=f"بازرسی سفارش {orders.ref(order)} {verdict} شد",
            body=data.note,
        )
    await track_record.refresh(db, order.supplier_id)
    _audit(db, user, order, inspection.status, attempt=inspection.attempt)
    await db.commit()
    return await _out(db, user, order, side, inspection)
