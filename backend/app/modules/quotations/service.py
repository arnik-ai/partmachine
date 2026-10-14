"""پیشنهاد قیمت: ثبت، ویرایش، پس‌گرفتن، فهرست‌ها و انتخاب برنده.

محرمانگی: صاحب RFQ همه‌ی پیشنهادهای فعال را می‌بیند؛ هر قطعه‌ساز فقط پیشنهاد خودش را.
یکپارچگی: هر تغییر روی ردیف RFQ قفل می‌گیرد (همیشه اول RFQ و بعد پیشنهاد، تا بن‌بست پیش نیاید)
و قیدهای پایگاه داده (یک پیشنهاد برای هر قطعه‌ساز، یک برنده برای هر RFQ) پشتوانه‌ی آن‌اند.
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.text import fa_digits
from app.core.time import business_today, utcnow
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.notifications import service as notifications
from app.modules.orders import service as orders
from app.modules.pricing.engine import estimate_price, judge_quote_price
from app.modules.quotations.models import Quotation
from app.modules.quotations.schemas import (
    CreateQuotationInput,
    MyQuotationOut,
    PriceAssessmentOut,
    QuotationOut,
    QuotationOutcome,
    RfqBrief,
)
from app.modules.rfqs import lifecycle
from app.modules.rfqs import service as rfq_service
from app.modules.rfqs.models import Rfq
from app.modules.rfqs.policies import RfqView, can_manage
from app.modules.suppliers import track_record
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.service import supplier_for_organization, trust_score

QUOTATION_NOT_FOUND = "پیشنهاد موردنظر پیدا نشد."
DUPLICATE_QUOTE = "شما قبلاً برای این درخواست قیمت داده‌اید."
NOT_ACCEPTING = "این درخواست دیگر پیشنهاد جدید نمی‌پذیرد."
QUOTES_CLOSED = "مهلت ارسال پیشنهاد برای این درخواست تمام شده است."


def to_out(
    quotation: Quotation,
    supplier: Supplier,
    rfq: Rfq,
    price_assessment: PriceAssessmentOut | None = None,
) -> QuotationOut:
    return QuotationOut(
        id=quotation.id,
        rfq_id=quotation.rfq_id,
        supplier_id=quotation.supplier_id,
        supplier_name=supplier.company_name,
        supplier_city=supplier.city,
        supplier_score=trust_score(supplier)["trust"],
        verified=supplier.verified,
        total_price_rials=quotation.total_price_rials,
        lead_time_days=quotation.lead_time_days,
        valid_until=quotation.valid_until,
        note=quotation.note,
        status=quotation.status,
        revision=quotation.revision,
        submitted_at=quotation.created_at,
        updated_at=quotation.updated_at,
        is_awarded=rfq.awarded_quotation_id == quotation.id,
        price_assessment=price_assessment,
    )


def assess_price(total_rials: int, estimate: dict[str, Any]) -> PriceAssessmentOut:
    judged = judge_quote_price(total_rials, estimate)
    percent = fa_digits(abs(judged["deviation_percent"]))
    messages = {
        "low": f"حدود {percent}٪ کمتر از برآورد منطقی؛ کیفیت و شرایط را بررسی کنید",
        "high": f"حدود {percent}٪ بیشتر از برآورد منطقی",
        "fair": "در محدوده‌ی برآورد منطقی",
    }
    return PriceAssessmentOut(
        verdict=judged["verdict"],
        deviation_percent=judged["deviation_percent"],
        message=messages[judged["verdict"]],
    )


def ensure_accepts_quotes(rfq: Rfq, today: date) -> None:
    if not lifecycle.is_open(rfq):
        raise Conflict(NOT_ACCEPTING, code="rfq_closed")
    if not lifecycle.accepts_quotes(rfq, today):
        raise Conflict(QUOTES_CLOSED, code="rfq_expired")


def _apply(quotation: Quotation, data: CreateQuotationInput) -> None:
    quotation.total_price_rials = data.total_price_rials
    quotation.lead_time_days = data.lead_time_days
    quotation.valid_until = data.valid_until
    quotation.note = data.note


def _outcome(quotation: Quotation, rfq: Rfq) -> QuotationOutcome:
    if quotation.status == "withdrawn":
        return "withdrawn"
    if rfq.status == "awarded":
        return "won" if rfq.awarded_quotation_id == quotation.id else "lost"
    if rfq.status == "cancelled":
        return "cancelled"
    return "pending"


async def _own_supplier(db: AsyncSession, user: CurrentUser) -> Supplier:
    supplier = await supplier_for_organization(db, user.organization_id)
    if supplier is None:
        raise Conflict("ابتدا پروفایل قطعه‌ساز خود را کامل کنید.", code="supplier_profile_missing")
    return supplier


async def _load_own_locked(
    db: AsyncSession, supplier: Supplier, quotation_id: uuid.UUID
) -> tuple[Quotation, Rfq]:
    """پیشنهاد قطعه‌ساز جاری؛ ترتیب قفل: اول RFQ، بعد پیشنهاد. پیشنهاد دیگران ⇒ 404."""
    rfq_id = await db.scalar(
        select(Quotation.rfq_id).where(
            Quotation.id == quotation_id, Quotation.supplier_id == supplier.id
        )
    )
    if rfq_id is None:
        raise NotFound(QUOTATION_NOT_FOUND)
    rfq = await db.scalar(select(Rfq).where(Rfq.id == rfq_id).with_for_update())
    quotation = await db.scalar(
        select(Quotation).where(Quotation.id == quotation_id).with_for_update()
    )
    assert rfq is not None and quotation is not None
    return quotation, rfq


async def list_for_rfq(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID
) -> list[QuotationOut]:
    rfq, view = await rfq_service.load_visible(db, user, rfq_id)
    stmt = (
        select(Quotation, Supplier)
        .join(Supplier, Supplier.id == Quotation.supplier_id)
        .where(Quotation.rfq_id == rfq.id)
        .order_by(Quotation.total_price_rials, Quotation.created_at)
    )
    if view is RfqView.FULL:
        rows = await db.execute(stmt.where(Quotation.status == "active"))
        estimate = estimate_price(
            capability=rfq.capability, material=rfq.material, quantity=rfq.quantity
        )
        return [to_out(q, s, rfq, assess_price(q.total_price_rials, estimate)) for q, s in rows]
    # قطعه‌ساز فقط پیشنهاد خودش را می‌بیند (حتی اگر پس گرفته باشد) — هرگز قیمت رقبا
    own = await supplier_for_organization(db, user.organization_id)
    if own is None:
        return []
    rows = await db.execute(stmt.where(Quotation.supplier_id == own.id))
    return [to_out(q, s, rfq) for q, s in rows]


async def list_mine(
    db: AsyncSession, user: CurrentUser, *, limit: int, offset: int
) -> tuple[list[MyQuotationOut], int]:
    supplier = await supplier_for_organization(db, user.organization_id)
    if supplier is None:
        return [], 0
    today = business_today()
    counts = rfq_service.active_counts()
    total = (
        await db.scalar(
            select(func.count(Quotation.id)).where(Quotation.supplier_id == supplier.id)
        )
        or 0
    )
    rows = await db.execute(
        select(Quotation, Rfq, func.coalesce(counts.c.n, 0))
        .join(Rfq, Rfq.id == Quotation.rfq_id)
        .outerjoin(counts, counts.c.rfq_id == Rfq.id)
        .where(Quotation.supplier_id == supplier.id)
        .order_by(Quotation.updated_at.desc(), Quotation.id)
        .limit(limit)
        .offset(offset)
    )
    rows_list = rows.all()
    order_ids = await orders.orders_for_quotations(db, [q.id for q, _, _ in rows_list])
    items = []
    for quotation, rfq, active in rows_list:
        brief = RfqBrief(
            id=rfq.id,
            title=rfq.title,
            status=lifecycle.effective_status(
                rfq, active_quotes=int(active), today=today, viewer_is_owner=False
            ),
            capability=rfq.capability,
            delivery_city=rfq.delivery_city,
            quotes_due=rfq.quotes_due,
            deadline=rfq.deadline,
        )
        base = to_out(quotation, supplier, rfq).model_dump()
        items.append(
            MyQuotationOut(
                **base,
                rfq=brief,
                outcome=_outcome(quotation, rfq),
                order_id=order_ids.get(quotation.id),
            )
        )
    return items, total


async def submit(
    db: AsyncSession, user: CurrentUser, rfq_id: uuid.UUID, data: CreateQuotationInput
) -> QuotationOut:
    supplier = await _own_supplier(db, user)
    # قفل ردیف RFQ. load_visible عمداً استفاده نمی‌شود: همه‌ی قطعه‌سازها RFQهای باز را می‌بینند، و
    # قطعه‌سازی که صفحه را باز داشته باید پس از بسته شدن پیام روشن ببیند، نه «پیدا نشد».
    rfq = await db.scalar(select(Rfq).where(Rfq.id == rfq_id).with_for_update())
    if rfq is None:
        raise NotFound(rfq_service.RFQ_NOT_FOUND)
    if rfq.organization_id == user.organization_id:
        raise Conflict("نمی‌توانید برای درخواست خودتان قیمت بدهید.", code="own_rfq")
    ensure_accepts_quotes(rfq, business_today())

    existing = await db.scalar(
        select(Quotation)
        .where(Quotation.rfq_id == rfq.id, Quotation.supplier_id == supplier.id)
        .with_for_update()
    )
    if existing is not None and existing.status == "active":
        raise Conflict(DUPLICATE_QUOTE, code="duplicate_quotation")
    if existing is not None:
        # ثبت دوباره‌ی پیشنهادی که قطعه‌ساز قبلاً پس گرفته بود (روی همان ردیف)
        quotation = existing
        _apply(quotation, data)
        quotation.status = "active"
        quotation.withdrawn_at = None
        quotation.revision += 1
        quotation.submitted_by_id = user.id
        action = "quotation.resubmitted"
    else:
        quotation = Quotation(
            id=uuid.uuid4(),
            rfq_id=rfq.id,
            supplier_id=supplier.id,
            submitted_by_id=user.id,
            status="active",
            revision=1,
            total_price_rials=data.total_price_rials,
            lead_time_days=data.lead_time_days,
            valid_until=data.valid_until,
            note=data.note,
        )
        db.add(quotation)
        action = "quotation.submitted"
    if rfq.status == "published":
        rfq.status = "quoting"
    await notifications.notify(
        db,
        organization_id=rfq.organization_id,
        kind="quote_received",
        title=f"پیشنهاد تازه برای «{rfq.title}»",
        body=f"{supplier.company_name} پیشنهاد قیمت ثبت کرد.",
        link=f"/rfqs/{rfq.id}",
    )
    audit.record(
        db,
        action=action,
        entity_type="quotation",
        entity_id=quotation.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"rfq_id": str(rfq.id), "revision": quotation.revision},
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise Conflict(DUPLICATE_QUOTE, code="duplicate_quotation") from None
    # سرعت پاسخ در سابقه‌ی قطعه‌ساز؛ جدا از ثبت پیشنهاد تا خطای احتمالی آن را باطل نکند
    await track_record.refresh(db, supplier.id)
    await db.commit()
    return to_out(quotation, supplier, rfq)


async def update(
    db: AsyncSession, user: CurrentUser, quotation_id: uuid.UUID, data: CreateQuotationInput
) -> QuotationOut:
    supplier = await _own_supplier(db, user)
    quotation, rfq = await _load_own_locked(db, supplier, quotation_id)
    if quotation.status != "active":
        raise Conflict(
            "این پیشنهاد پس گرفته شده است؛ برای فعال کردن، آن را دوباره ثبت کنید.",
            code="quotation_withdrawn",
        )
    ensure_accepts_quotes(rfq, business_today())
    previous = {
        "total_price_rials": quotation.total_price_rials,
        "lead_time_days": quotation.lead_time_days,
        "valid_until": quotation.valid_until.isoformat(),
    }
    _apply(quotation, data)
    quotation.revision += 1
    await notifications.notify(
        db,
        organization_id=rfq.organization_id,
        kind="quote_revised",
        title=f"پیشنهاد «{supplier.company_name}» برای «{rfq.title}» به‌روز شد",
        link=f"/rfqs/{rfq.id}",
    )
    audit.record(
        db,
        action="quotation.revised",
        entity_type="quotation",
        entity_id=quotation.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"rfq_id": str(rfq.id), "revision": quotation.revision, "previous": previous},
    )
    await db.commit()
    return to_out(quotation, supplier, rfq)


async def withdraw(db: AsyncSession, user: CurrentUser, quotation_id: uuid.UUID) -> QuotationOut:
    supplier = await _own_supplier(db, user)
    quotation, rfq = await _load_own_locked(db, supplier, quotation_id)
    if quotation.status == "withdrawn":
        return to_out(quotation, supplier, rfq)  # تکرار درخواست: بی‌اثر و موفق
    if not lifecycle.is_open(rfq):
        raise Conflict(
            "پس از انتخاب برنده یا لغو درخواست، امکان پس‌گرفتن پیشنهاد نیست.", code="rfq_closed"
        )
    quotation.status = "withdrawn"
    quotation.withdrawn_at = utcnow()
    audit.record(
        db,
        action="quotation.withdrawn",
        entity_type="quotation",
        entity_id=quotation.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"rfq_id": str(rfq.id)},
    )
    await db.commit()
    return to_out(quotation, supplier, rfq)


async def award(db: AsyncSession, user: CurrentUser, quotation_id: uuid.UUID) -> QuotationOut:
    rfq_id = await db.scalar(select(Quotation.rfq_id).where(Quotation.id == quotation_id))
    if rfq_id is None:
        raise NotFound(QUOTATION_NOT_FOUND)
    # قفل ردیف RFQ: انتخاب‌ها، ویرایش‌ها و پس‌گرفتن‌های هم‌زمان پشت سر هم اجرا می‌شوند
    rfq = await db.scalar(select(Rfq).where(Rfq.id == rfq_id).with_for_update())
    if rfq is None or not can_manage(rfq, user):
        raise NotFound(QUOTATION_NOT_FOUND)
    quotation = await db.scalar(select(Quotation).where(Quotation.id == quotation_id))
    assert quotation is not None
    supplier = await db.get(Supplier, quotation.supplier_id)
    assert supplier is not None

    if rfq.awarded_quotation_id == quotation.id:
        return to_out(quotation, supplier, rfq)  # تکرار همان درخواست: بی‌اثر و موفق
    if rfq.awarded_quotation_id is not None:
        raise Conflict("برای این درخواست قبلاً برنده انتخاب شده است.", code="already_awarded")
    if not lifecycle.can_award(rfq):
        raise Conflict("این درخواست بسته شده است و برنده‌ای نمی‌توان انتخاب کرد.", code="rfq_closed")
    if quotation.status != "active":
        raise Conflict(
            "این پیشنهاد پس گرفته شده است و قابل انتخاب نیست.", code="quotation_withdrawn"
        )
    if quotation.valid_until < business_today():
        raise Conflict("اعتبار این پیشنهاد به پایان رسیده است.", code="quotation_expired")

    rfq.awarded_quotation_id = quotation.id
    rfq.status = "awarded"
    audit.record(
        db,
        action="rfq.awarded",
        entity_type="rfq",
        entity_id=rfq.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"quotation_id": str(quotation.id), "supplier_id": str(supplier.id)},
    )
    # سفارش در همین تراکنش ساخته می‌شود (O1): برنده بدون سفارش یا سفارش بدون برنده نداریم
    order = await orders.create_for_award(
        db, rfq=rfq, quotation=quotation, supplier=supplier, actor=user
    )
    await notifications.notify(
        db,
        organization_id=supplier.organization_id,
        kind="quote_won",
        title=f"پیشنهاد شما برای «{rfq.title}» برنده شد",
        body="سفارش ساخته شد؛ قدم بعدی تنظیم و امضای قرارداد است.",
        link=f"/orders/{order.id}",
    )
    # بقیه‌ی پیشنهاددهنده‌ها نتیجه را می‌دانند، بی‌آنکه نام یا قیمت برنده را ببینند
    others = await db.scalars(
        select(Supplier.organization_id)
        .join(Quotation, Quotation.supplier_id == Supplier.id)
        .where(
            Quotation.rfq_id == rfq.id,
            Quotation.status == "active",
            Quotation.id != quotation.id,
        )
    )
    for organization_id in set(others):
        await notifications.notify(
            db,
            organization_id=organization_id,
            kind="quote_lost",
            title=f"درخواست «{rfq.title}» به پیشنهاد دیگری واگذار شد",
            body="از شرکت شما برای پیشنهادتان سپاسگزاریم.",
            link="/quotations",
        )
    await db.commit()
    return to_out(quotation, supplier, rfq)
