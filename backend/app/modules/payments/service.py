"""پیگیری پرداخت سفارش (O6، O7) — پول از پلتفرم عبور نمی‌کند.

اقساط هنگام امضای قرارداد طبق شرایط پرداخت آن ساخته می‌شوند. کارفرما پرداخت انجام‌شده را با
رسید یا شماره‌ی پیگیری اعلام می‌کند؛ قطعه‌ساز دریافت را تأیید یا با دلیل رد می‌کند. تأیید
پیش‌پرداخت سفارش را به تولید می‌برد و تأیید همه‌ی اقساط پس از تحویل، سفارش را تکمیل می‌کند.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import Conflict, Forbidden, NotFound, field_error
from app.core.time import business_today, utcnow
from app.modules.audit import service as audit
from app.modules.contracts.models import Contract, ContractVersion
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.orders import service as orders
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderFileOut
from app.modules.payments.models import OrderPayment
from app.modules.payments.schemas import (
    PaymentOut,
    PaymentsOut,
    RejectPaymentInput,
    ReportPaymentInput,
)
from app.modules.suppliers import track_record

PAYMENT_NOT_FOUND = "قسط موردنظر پیدا نشد."
# قسط پایانی از زمان ارسال به بعد قابل اعلام است
FINAL_DUE_STATUSES = frozenset({"shipped", "delivered"})


def schedule(amount_rials: int, prepayment_percent: int) -> list[tuple[str, int, int]]:
    """(نوع، درصد، مبلغ) هر قسط؛ جمع مبالغ دقیقاً برابر مبلغ قرارداد است."""
    if prepayment_percent <= 0:
        return [("final", 100, amount_rials)]
    if prepayment_percent >= 100:
        return [("prepayment", 100, amount_rials)]
    prepayment = amount_rials * prepayment_percent // 100
    return [
        ("prepayment", prepayment_percent, prepayment),
        ("final", 100 - prepayment_percent, amount_rials - prepayment),
    ]


async def create_schedule(db: AsyncSession, order: Order, prepayment_percent: int) -> None:
    """اقساط سفارش (فقط یک‌بار)؛ در همان تراکنش امضای قرارداد فراخوانده می‌شود."""
    existing = await db.scalar(
        select(func.count()).select_from(OrderPayment).where(OrderPayment.order_id == order.id)
    )
    if existing:
        return
    for number, (kind, percent, amount) in enumerate(
        schedule(order.amount_rials, prepayment_percent), start=1
    ):
        db.add(
            OrderPayment(
                id=uuid.uuid4(),
                order_id=order.id,
                number=number,
                kind=kind,
                percent=percent,
                amount_rials=amount,
                status="pending",
                created_at=utcnow(),
            )
        )


async def _ensure_schedule(db: AsyncSession, order: Order) -> bool:
    """قراردادهایی که پیش از این گام امضا شده‌اند هم اقساط بگیرند."""
    if order.status in ("awaiting_contract", "cancelled"):
        return False
    if await db.scalar(
        select(func.count()).select_from(OrderPayment).where(OrderPayment.order_id == order.id)
    ):
        return False
    prepayment = await db.scalar(
        select(ContractVersion.prepayment_percent)
        .join(Contract, Contract.id == ContractVersion.contract_id)
        .where(
            Contract.order_id == order.id,
            Contract.signed_at.is_not(None),
            ContractVersion.number == Contract.current_version,
        )
    )
    if prepayment is None:
        return False
    await create_schedule(db, order, prepayment)
    await db.flush()
    return True


def _can_report(payment: OrderPayment, order: Order, side: str) -> bool:
    if side != "buyer" or payment.status != "pending":
        return False
    if payment.kind == "prepayment":
        return order.status == "awaiting_prepayment"
    return order.status in FINAL_DUE_STATUSES


def _can_confirm(payment: OrderPayment, side: str) -> bool:
    return side == "supplier" and payment.status == "reported"


async def _out(db: AsyncSession, order: Order, side: str) -> PaymentsOut:
    reporter = aliased(User)
    confirmer = aliased(User)
    rows = (
        await db.execute(
            select(OrderPayment, reporter.full_name, confirmer.full_name, StoredFile)
            .outerjoin(reporter, reporter.id == OrderPayment.reported_by_id)
            .outerjoin(confirmer, confirmer.id == OrderPayment.confirmed_by_id)
            .outerjoin(StoredFile, StoredFile.id == OrderPayment.receipt_file_id)
            .where(OrderPayment.order_id == order.id)
            .order_by(OrderPayment.number)
        )
    ).all()
    items = []
    for payment, reported_by, confirmed_by, receipt in rows:
        reported = payment.status != "pending"
        items.append(
            PaymentOut(
                id=payment.id,
                number=payment.number,
                kind=payment.kind,
                percent=payment.percent,
                amount_rials=payment.amount_rials,
                status=payment.status,
                reported_at=payment.reported_at,
                reported_by_name=reported_by if reported else None,
                paid_on=payment.paid_on if reported else None,
                reference=payment.reference if reported else "",
                note=payment.note if reported else "",
                receipt=OrderFileOut(
                    id=receipt.id,
                    name=receipt.original_name,
                    size=receipt.size_bytes,
                    kind=receipt.kind,
                )
                if receipt is not None and reported
                else None,
                confirmed_at=payment.confirmed_at,
                confirmed_by_name=confirmed_by,
                rejection_reason=payment.rejection_reason,
                can_report=_can_report(payment, order, side),
                can_confirm=_can_confirm(payment, side),
            )
        )
    return PaymentsOut(
        items=items,
        total_rials=sum(p.amount_rials for p in items),
        confirmed_rials=sum(p.amount_rials for p in items if p.status == "confirmed"),
    )


async def list_payments(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> PaymentsOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    if await _ensure_schedule(db, order):
        await db.commit()
    return await _out(db, order, side)


async def _locked_payment(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, payment_id: uuid.UUID
) -> tuple[Order, str, OrderPayment]:
    order, side = await orders.load(db, user, order_id, for_update=True)
    await _ensure_schedule(db, order)
    payment = await db.scalar(
        select(OrderPayment)
        .where(OrderPayment.id == payment_id, OrderPayment.order_id == order.id)
        .with_for_update()
    )
    if payment is None:
        raise NotFound(PAYMENT_NOT_FOUND)
    return order, side, payment


def _label(payment: OrderPayment) -> str:
    return "پیش‌پرداخت" if payment.kind == "prepayment" else "تسویه‌ی پایانی"


async def report(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    payment_id: uuid.UUID,
    data: ReportPaymentInput,
) -> PaymentsOut:
    order, side, payment = await _locked_payment(db, user, order_id, payment_id)
    if side != "buyer":
        raise Forbidden("اعلام پرداخت با کارفرما است.", code="not_your_step")
    if payment.status != "pending":
        return await _out(db, order, side)  # اعلام تکراری (مثلاً تکرار شبکه): بی‌اثر
    if not _can_report(payment, order, side):
        raise Conflict(
            "پیش‌پرداخت پس از امضای قرارداد و پیش از شروع تولید اعلام می‌شود."
            if payment.kind == "prepayment"
            else "تسویه‌ی پایانی پس از ارسال سفارش اعلام می‌شود.",
            code="payment_not_due",
        )
    if not data.reference and data.file_id is None:
        raise field_error("reference", "شماره‌ی پیگیری را بنویسید یا تصویر رسید را بارگذاری کنید.")
    if data.paid_on > business_today():
        raise field_error("paidOn", "تاریخ پرداخت نمی‌تواند در آینده باشد.")

    if data.file_id is not None:
        payment.receipt_file_id = await orders.attach_document(db, user, order, data.file_id)
    payment.status = "reported"
    payment.reported_at = utcnow()
    payment.reported_by_id = user.id
    payment.paid_on = data.paid_on
    payment.reference = data.reference
    payment.note = data.note
    payment.rejection_reason = None
    orders.record_event(
        db,
        order,
        "payment_reported",
        None,
        None,
        user,
        side,
        f"{_label(payment)} — شماره‌ی پیگیری: {data.reference}"
        if data.reference
        else _label(payment),
        payment.receipt_file_id,
    )
    await orders.notify_side(
        db,
        order,
        "supplier",
        user,
        kind="payment_reported",
        title=f"کارفرما {_label(payment)} سفارش {orders.ref(order)} را اعلام کرد",
        body="پس از بررسی حساب، دریافت را تأیید یا رد کنید.",
    )
    audit.record(
        db,
        action="payment.reported",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"payment": payment.number, "amount_rials": payment.amount_rials},
    )
    await db.commit()
    return await _out(db, order, side)


async def confirm(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, payment_id: uuid.UUID
) -> PaymentsOut:
    order, side, payment = await _locked_payment(db, user, order_id, payment_id)
    if side != "supplier":
        raise Forbidden("تأیید دریافت با قطعه‌ساز است.", code="not_your_step")
    if payment.status == "confirmed":
        return await _out(db, order, side)
    if payment.status != "reported":
        raise Conflict("ابتدا کارفرما باید پرداخت را اعلام کند.", code="payment_not_reported")

    now = utcnow()
    payment.status = "confirmed"
    payment.confirmed_at = now
    payment.confirmed_by_id = user.id
    previous = order.status
    pending_prepayment = await db.scalar(
        select(func.count())
        .select_from(OrderPayment)
        .where(
            OrderPayment.order_id == order.id,
            OrderPayment.kind == "prepayment",
            OrderPayment.status != "confirmed",
            OrderPayment.id != payment.id,
        )
    )
    if order.status == "awaiting_prepayment" and not pending_prepayment:
        order.status = "in_production"
    elif order.status == "delivered" and await orders.all_paid(db, order.id, also=payment.id):
        order.status = "completed"
        order.completed_at = now
    changed = order.status != previous
    orders.record_event(
        db,
        order,
        "payment_confirmed",
        previous if changed else None,
        order.status if changed else None,
        user,
        side,
        _label(payment),
    )
    await orders.notify_side(
        db,
        order,
        "buyer",
        user,
        kind="payment_confirmed",
        title=f"قطعه‌ساز دریافت {_label(payment)} سفارش {orders.ref(order)} را تأیید کرد",
        body="سفارش تکمیل شد."
        if order.status == "completed"
        else "تولید شروع شد."
        if changed and order.status == "in_production"
        else "",
    )
    if order.status == "completed":
        await track_record.refresh(db, order.supplier_id)
    audit.record(
        db,
        action="payment.confirmed",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"payment": payment.number, "amount_rials": payment.amount_rials},
    )
    await db.commit()
    return await _out(db, order, side)


async def reject(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    payment_id: uuid.UUID,
    data: RejectPaymentInput,
) -> PaymentsOut:
    order, side, payment = await _locked_payment(db, user, order_id, payment_id)
    if side != "supplier":
        raise Forbidden("تأیید یا رد دریافت با قطعه‌ساز است.", code="not_your_step")
    if payment.status != "reported":
        raise Conflict("فقط پرداختِ اعلام‌شده را می‌توان رد کرد.", code="payment_not_reported")
    payment.status = "pending"
    payment.reported_at = None
    payment.rejection_reason = data.reason
    orders.record_event(
        db, order, "payment_rejected", None, None, user, side, f"{_label(payment)}: {data.reason}"
    )
    await orders.notify_side(
        db,
        order,
        "buyer",
        user,
        kind="payment_rejected",
        title=f"قطعه‌ساز اعلام {_label(payment)} سفارش {orders.ref(order)} را رد کرد",
        body=f"دلیل: {data.reason}",
    )
    audit.record(
        db,
        action="payment.rejected",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"payment": payment.number},
    )
    await db.commit()
    return await _out(db, order, side)
