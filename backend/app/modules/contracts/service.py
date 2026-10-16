"""قرارداد هر سفارش: تنظیم خودکار از روی سفارش، نسخه‌های تغییرناپذیر با هش، اصلاح پارامترها توسط
کارفرما پیش از امضا (O5)، امضای مدیر هر دو طرف با رمز عبور و شاهد کامل (O2، O3)، و رفتن سفارش
به مرحله‌ی بعد پس از امضای هر دو طرف."""

import uuid
from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.errors import Conflict, Forbidden, field_error
from app.core.security import verify_password
from app.core.time import business_today, utcnow
from app.modules.audit import service as audit
from app.modules.contracts import template
from app.modules.contracts.models import Contract, ContractSignature, ContractVersion
from app.modules.contracts.schemas import (
    ChangeRequestInput,
    ContractArticleOut,
    ContractOut,
    ContractSignatureOut,
    ContractTermsOut,
    ContractVersionSummary,
    SignContractInput,
    UpdateContractInput,
)
from app.modules.files.models import StoredFile
from app.modules.identity.deps import ClientInfo, CurrentUser
from app.modules.identity.models import User
from app.modules.orders import lifecycle
from app.modules.orders import service as orders
from app.modules.orders.models import Order
from app.modules.organizations.models import Organization
from app.modules.payments import service as payments
from app.modules.suppliers.models import Supplier

# پیش‌فرض‌های نسخه‌ی اول (O4): پرداخت کامل پس از تحویل، جریمه‌ی ۰٫۵٪ روزانه تا سقف ۱۰٪
DEFAULT_PREPAYMENT_PERCENT = 0
DEFAULT_PENALTY_PER_DAY_BP = 50
DEFAULT_PENALTY_CAP_PERCENT = 10

LOCKED = "قرارداد این سفارش امضا شده یا سفارش دیگر در مرحله‌ی قرارداد نیست."
OWNER_ONLY = "فقط مدیر سازمان می‌تواند قرارداد را امضا کند."


async def _facts(db: AsyncSession, order: Order) -> template.ContractFacts:
    buyer = await db.get(Organization, order.buyer_organization_id)
    supplier_org = await db.get(Organization, order.supplier_organization_id)
    supplier = await db.get(Supplier, order.supplier_id)
    assert buyer is not None and supplier_org is not None and supplier is not None
    files = await db.scalars(
        select(StoredFile)
        .where(StoredFile.rfq_id == order.rfq_id)
        .order_by(StoredFile.created_at, StoredFile.id)
    )
    return template.ContractFacts(
        order_number=order.number,
        buyer_name=buyer.name,
        supplier_name=supplier_org.name,
        supplier_verified=supplier.verified,
        title=order.title,
        quantity=order.quantity,
        material=order.material,
        amount_rials=order.amount_rials,
        delivery_city=order.delivery_city,
        lead_time_days=order.lead_time_days,
        files=tuple((f.original_name, f.size_bytes, f.sha256) for f in files),
    )


async def _new_version(
    db: AsyncSession,
    contract: Contract,
    order: Order,
    number: int,
    terms: template.ContractTerms,
    actor: CurrentUser | None,
    note: str = "",
) -> ContractVersion:
    articles = template.render(await _facts(db, order), terms)
    version = ContractVersion(
        id=uuid.uuid4(),
        contract_id=contract.id,
        number=number,
        delivery_due=terms.delivery_due,
        prepayment_percent=terms.prepayment_percent,
        penalty_per_day_bp=terms.penalty_per_day_bp,
        penalty_cap_percent=terms.penalty_cap_percent,
        material_from_buyer=terms.material_from_buyer,
        articles=articles,
        template_version=template.TEMPLATE_VERSION,
        content_sha256=template.content_hash(articles, terms),
        change_note=note,
        created_by_id=actor.id if actor else None,
        created_at=utcnow(),
    )
    db.add(version)
    return version


async def _ensure(db: AsyncSession, order: Order) -> tuple[Contract, bool]:
    """قرارداد را برمی‌گرداند و اگر هنوز ساخته نشده، نسخه‌ی ۱ را از روی سفارش می‌سازد.
    فراخواننده ردیف سفارش را قفل کرده است، پس ساخت هم‌زمان رخ نمی‌دهد."""
    contract = await db.scalar(select(Contract).where(Contract.order_id == order.id))
    if contract is not None:
        return contract, False
    contract = Contract(id=uuid.uuid4(), order_id=order.id, current_version=1, created_at=utcnow())
    db.add(contract)
    await db.flush()
    terms = template.ContractTerms(
        delivery_due=order.delivery_due,
        prepayment_percent=DEFAULT_PREPAYMENT_PERCENT,
        penalty_per_day_bp=DEFAULT_PENALTY_PER_DAY_BP,
        penalty_cap_percent=DEFAULT_PENALTY_CAP_PERCENT,
        material_from_buyer=order.material_from_buyer,
    )
    await _new_version(db, contract, order, 1, terms, None)
    await db.flush()
    return contract, True


async def _current(db: AsyncSession, contract: Contract) -> ContractVersion:
    version = await db.scalar(
        select(ContractVersion).where(
            ContractVersion.contract_id == contract.id,
            ContractVersion.number == contract.current_version,
        )
    )
    assert version is not None
    return version


async def _signatures(
    db: AsyncSession, version_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[ContractSignatureOut]]:
    if not version_ids:
        return {}
    rows = await db.execute(
        select(ContractSignature, User.full_name, Organization.name)
        .join(User, User.id == ContractSignature.user_id)
        .join(Organization, Organization.id == ContractSignature.organization_id)
        .where(ContractSignature.version_id.in_(version_ids))
        .order_by(ContractSignature.signed_at)
    )
    result: dict[uuid.UUID, list[ContractSignatureOut]] = defaultdict(list)
    for signature, signer, organization in rows.all():
        result[signature.version_id].append(
            ContractSignatureOut(
                side=signature.side,
                signer_name=signer,
                organization_name=organization,
                signed_at=signature.signed_at,
            )
        )
    return result


def _editable(order: Order, contract: Contract) -> bool:
    return order.status == "awaiting_contract" and contract.signed_at is None


async def _out(
    db: AsyncSession, user: CurrentUser, order: Order, side: str, contract: Contract
) -> ContractOut:
    versions = list(
        await db.scalars(
            select(ContractVersion)
            .where(ContractVersion.contract_id == contract.id)
            .order_by(ContractVersion.number.desc())
        )
    )
    current = next(v for v in versions if v.number == contract.current_version)
    signatures = await _signatures(db, [v.id for v in versions])
    creator_ids = [v.created_by_id for v in versions if v.created_by_id]
    creator_rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(creator_ids)))
    creators = dict(creator_rows.tuples().all())
    signed_sides = {s.side for s in signatures.get(current.id, [])}
    editable = _editable(order, contract)
    status = (
        "signed"
        if contract.signed_at is not None
        else "partially_signed"
        if signed_sides
        else "draft"
    )
    return ContractOut(
        order_id=order.id,
        order_number=order.number,
        status=status,
        version=current.number,
        terms=ContractTermsOut(
            delivery_due=current.delivery_due,
            prepayment_percent=current.prepayment_percent,
            penalty_per_day_bp=current.penalty_per_day_bp,
            penalty_cap_percent=current.penalty_cap_percent,
            material_from_buyer=current.material_from_buyer,
        ),
        articles=[ContractArticleOut(**a) for a in current.articles],
        content_sha256=current.content_sha256,
        template_version=current.template_version,
        created_at=current.created_at,
        signed_at=contract.signed_at,
        signatures=signatures.get(current.id, []),
        history=[
            ContractVersionSummary(
                number=v.number,
                created_at=v.created_at,
                created_by_name=creators.get(v.created_by_id) if v.created_by_id else None,
                change_note=v.change_note,
                content_sha256=v.content_sha256,
                signatures=signatures.get(v.id, []),
            )
            for v in versions
            if v.number != current.number
        ],
        my_side=side,
        is_open=editable,
        can_edit=editable and side == "buyer",
        can_sign=editable
        and side in ("buyer", "supplier")
        and user.is_org_owner
        and side not in signed_sides,
        can_request_change=editable and side == "supplier",
        draft_notice=template.DRAFT_NOTICE,
    )


async def get_contract(db: AsyncSession, user: CurrentUser, order_id: uuid.UUID) -> ContractOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    contract, created = await _ensure(db, order)
    if created:
        audit.record(
            db,
            action="contract.created",
            entity_type="order",
            entity_id=order.id,
            actor_user_id=user.id,
            organization_id=user.organization_id,
        )
        await db.commit()
    return await _out(db, user, order, side, contract)


async def update_contract(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: UpdateContractInput
) -> ContractOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    if side != "buyer":
        raise Forbidden("پارامترهای قرارداد را کارفرما تنظیم می‌کند.", code="not_your_step")
    contract, _ = await _ensure(db, order)
    if not _editable(order, contract):
        raise Conflict(LOCKED, code="contract_locked")
    if data.delivery_due < business_today():
        raise field_error("deliveryDue", "تاریخ تحویل نمی‌تواند گذشته باشد.")
    current = await _current(db, contract)
    terms = template.ContractTerms(
        delivery_due=data.delivery_due,
        prepayment_percent=data.prepayment_percent,
        penalty_per_day_bp=data.penalty_per_day_bp,
        penalty_cap_percent=data.penalty_cap_percent,
        material_from_buyer=data.material_from_buyer,
    )
    unchanged = (
        current.delivery_due,
        current.prepayment_percent,
        current.penalty_per_day_bp,
        current.penalty_cap_percent,
        current.material_from_buyer,
    ) == (
        terms.delivery_due,
        terms.prepayment_percent,
        terms.penalty_per_day_bp,
        terms.penalty_cap_percent,
        terms.material_from_buyer,
    )
    if unchanged:
        return await _out(db, user, order, side, contract)

    number = contract.current_version + 1
    await _new_version(db, contract, order, number, terms, user, data.change_note)
    contract.current_version = number
    # تاریخ تحویل سفارش همان تاریخ قرارداد است
    order.delivery_due = data.delivery_due
    order.material_from_buyer = data.material_from_buyer
    orders.record_event(db, order, "contract_revised", None, None, user, side, data.change_note)
    await orders.notify_side(
        db,
        order,
        "supplier",
        user,
        kind="contract_revised",
        title=f"نسخه‌ی تازه‌ی قرارداد سفارش {orders.ref(order)}",
        body=data.change_note
        or "کارفرما شرایط قرارداد را تغییر داد؛ نسخه‌ی تازه را بخوانید و امضا کنید.",
        link_suffix="/contract",
    )
    audit.record(
        db,
        action="contract.revised",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"version": number},
    )
    await db.commit()
    return await _out(db, user, order, side, contract)


async def sign_contract(
    db: AsyncSession,
    user: CurrentUser,
    order_id: uuid.UUID,
    data: SignContractInput,
    client: ClientInfo,
) -> ContractOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    if side not in ("buyer", "supplier"):
        raise Forbidden("قرارداد را فقط دو طرف سفارش امضا می‌کنند.", code="not_your_step")
    if not user.is_org_owner:
        raise Forbidden(OWNER_ONLY, code="not_org_owner")
    contract, _ = await _ensure(db, order)
    current = await _current(db, contract)
    signed = await db.scalar(
        select(ContractSignature).where(
            ContractSignature.version_id == current.id, ContractSignature.side == side
        )
    )
    if signed is not None:
        return await _out(db, user, order, side, contract)  # امضای تکراری: بی‌اثر
    if not _editable(order, contract):
        raise Conflict(LOCKED, code="contract_locked")
    if data.version != contract.current_version:
        raise Conflict(
            "قرارداد پس از خواندن شما تغییر کرده است. نسخه‌ی تازه را بخوانید و دوباره امضا کنید.",
            code="contract_changed",
        )

    subject = str(user.id)
    await rate_limit.ensure_below(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
    account = await db.get(User, user.id)
    assert account is not None
    if not await verify_password(data.password, account.hashed_password):
        await rate_limit.record(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)
        raise field_error("password", "رمز عبور درست نیست.")
    await rate_limit.reset(rate_limit.PASSWORD_CHANGE_FAILURES_PER_USER, subject)

    db.add(
        ContractSignature(
            id=uuid.uuid4(),
            version_id=current.id,
            side=side,
            organization_id=user.organization_id,
            user_id=user.id,
            content_sha256=current.content_sha256,
            ip=client.ip,
            user_agent=client.user_agent,
            signed_at=utcnow(),
        )
    )
    await db.flush()
    sides = set(
        await db.scalars(
            select(ContractSignature.side).where(ContractSignature.version_id == current.id)
        )
    )
    from_status = order.status
    to_status: str | None = None
    if sides == {"buyer", "supplier"}:
        contract.signed_at = utcnow()
        order.material_from_buyer = current.material_from_buyer
        to_status = (
            "awaiting_prepayment"
            if current.prepayment_percent > 0
            else lifecycle.production_start(order)
        )
        order.status = to_status
        # اقساط طبق شرایط پرداخت همین نسخه (O7)
        await payments.create_schedule(db, order, current.prepayment_percent)
    orders.record_event(
        db,
        order,
        "contract_signed",
        from_status if to_status else None,
        to_status,
        user,
        side,
        f"نسخه‌ی {current.number}",
    )
    if to_status:
        for party in ("buyer", "supplier"):
            await orders.notify_side(
                db,
                order,
                party,
                user,
                kind="contract_effective",
                title=f"قرارداد سفارش {orders.ref(order)} نافذ شد",
                body="هر دو طرف امضا کردند و سفارش وارد مرحله‌ی بعد شد.",
            )
    else:
        await orders.notify_side(
            db,
            order,
            orders.other_side(side),
            user,
            kind="contract_signed",
            title=f"طرف مقابل قرارداد سفارش {orders.ref(order)} را امضا کرد",
            body="نوبت امضای مدیر سازمان شماست.",
            link_suffix="/contract",
        )
    audit.record(
        db,
        action="contract.signed",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"version": current.number, "side": side, "sha256": current.content_sha256},
    )
    await db.commit()
    return await _out(db, user, order, side, contract)


async def request_change(
    db: AsyncSession, user: CurrentUser, order_id: uuid.UUID, data: ChangeRequestInput
) -> ContractOut:
    order, side = await orders.load(db, user, order_id, for_update=True)
    if side != "supplier":
        raise Forbidden("درخواست اصلاح را قطعه‌ساز می‌فرستد.", code="not_your_step")
    contract, _ = await _ensure(db, order)
    if not _editable(order, contract):
        raise Conflict(LOCKED, code="contract_locked")
    orders.record_event(db, order, "contract_change_requested", None, None, user, side, data.note)
    await orders.notify_side(
        db,
        order,
        "buyer",
        user,
        kind="contract_change_requested",
        title=f"قطعه‌ساز اصلاح قرارداد سفارش {orders.ref(order)} را درخواست کرد",
        body=data.note,
        link_suffix="/contract",
    )
    audit.record(
        db,
        action="contract.change_requested",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
    )
    await db.commit()
    return await _out(db, user, order, side, contract)
