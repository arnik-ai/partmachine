"""تأیید هویت قطعه‌ساز (P4): قطعه‌ساز مدارک را می‌فرستد و ادمین با ذکر دلیل تأیید یا رد می‌کند.

نشان «تأییدشده» (`suppliers.verified`) فقط از همین مسیر روشن یا خاموش می‌شود. ترتیب قفل در
همه‌ی تابع‌ها یکسان است: اول ردیف قطعه‌ساز، بعد درخواست.
"""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import Conflict, Forbidden, NotFound, field_error
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import User
from app.modules.notifications import service as notifications
from app.modules.organizations.models import Organization
from app.modules.suppliers import service as suppliers
from app.modules.suppliers.models import Supplier
from app.modules.verification.models import VerificationRequest
from app.modules.verification.schemas import (
    AdminVerificationOut,
    AdminVerificationPage,
    SubmitVerificationInput,
    VerificationFileOut,
    VerificationOut,
    VerificationStatus,
)

NOT_FOUND = "درخواست تأیید موردنظر پیدا نشد."
PENDING_EXISTS = "درخواست قبلی شما هنوز در حال بررسی است؛ نتیجه را همین‌جا خواهید دید."
REASON_REQUIRED = "دلیل را بنویسید؛ این متن به قطعه‌ساز نمایش داده می‌شود."


async def _files(
    db: AsyncSession, request_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[VerificationFileOut]]:
    if not request_ids:
        return {}
    rows = await db.scalars(
        select(StoredFile)
        .where(StoredFile.verification_request_id.in_(request_ids))
        .order_by(StoredFile.created_at, StoredFile.id)
    )
    result: dict[uuid.UUID, list[VerificationFileOut]] = defaultdict(list)
    for stored in rows:
        assert stored.verification_request_id is not None
        result[stored.verification_request_id].append(
            VerificationFileOut(
                id=stored.id, name=stored.original_name, size=stored.size_bytes, kind=stored.kind
            )
        )
    return result


def _out(request: VerificationRequest, files: list[VerificationFileOut]) -> VerificationOut:
    return VerificationOut(
        id=request.id,
        status=request.status,
        note=request.note,
        created_at=request.created_at,
        decided_at=request.decided_at,
        decision_reason=request.decision_reason,
        revoked_at=request.revoked_at,
        revoke_reason=request.revoke_reason,
        files=files,
    )


async def latest(db: AsyncSession, user: CurrentUser) -> VerificationOut | None:
    request = await db.scalar(
        select(VerificationRequest)
        .where(VerificationRequest.organization_id == user.organization_id)
        .order_by(VerificationRequest.created_at.desc(), VerificationRequest.id.desc())
        .limit(1)
    )
    if request is None:
        return None
    files = await _files(db, [request.id])
    return _out(request, files.get(request.id, []))


async def submit(
    db: AsyncSession, user: CurrentUser, data: SubmitVerificationInput
) -> VerificationOut:
    if not user.is_org_owner:
        raise Forbidden("فقط مدیر سازمان می‌تواند درخواست تأیید بفرستد.", code="not_org_owner")
    supplier = await suppliers.supplier_for_organization(db, user.organization_id, for_update=True)
    if supplier is None:
        raise NotFound("سازمان شما پروفایل قطعه‌ساز ندارد.", code="no_supplier_profile")
    if supplier.verified:
        raise Conflict("شرکت شما از قبل تأییدشده است.", code="already_verified")
    if not suppliers.is_listed(supplier):
        raise Conflict(
            "ابتدا پروفایل شرکت را کامل و ذخیره کنید (شهر و حداقل یک خدمت).",
            code="profile_incomplete",
        )
    pending = await db.scalar(
        select(VerificationRequest.id).where(
            VerificationRequest.organization_id == user.organization_id,
            VerificationRequest.status == "pending",
        )
    )
    if pending is not None:
        raise Conflict(PENDING_EXISTS, code="verification_pending")

    files = list(
        await db.scalars(
            select(StoredFile)
            .where(
                StoredFile.id.in_(data.file_ids),
                StoredFile.organization_id == user.organization_id,
                StoredFile.purpose == "verification_document",
                StoredFile.verification_request_id.is_(None),
            )
            .with_for_update()
        )
    )
    if len(files) != len(data.file_ids):
        raise field_error(
            "fileIds", "یکی از مدارک پیدا نشد یا قبلاً ارسال شده است؛ دوباره بارگذاری کنید."
        )

    request = VerificationRequest(
        id=uuid.uuid4(),
        organization_id=user.organization_id,
        submitted_by_id=user.id,
        status="pending",
        note=data.note,
        created_at=utcnow(),
    )
    db.add(request)
    try:
        await db.flush()
    except IntegrityError:
        # درخواست هم‌زمان دیگری همین لحظه ثبت شد (ایندکس یکتای «در انتظار»)
        await db.rollback()
        raise Conflict(PENDING_EXISTS, code="verification_pending") from None
    for stored in files:
        stored.verification_request_id = request.id
    audit.record(
        db,
        action="verification.submitted",
        entity_type="verification_request",
        entity_id=request.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"files": len(files)},
    )
    await db.commit()
    by_request = await _files(db, [request.id])
    return _out(request, by_request.get(request.id, []))


# --- ادمین ------------------------------------------------------------------------------------


def _admin_select():  # type: ignore[no-untyped-def]
    submitter = aliased(User)
    decider = aliased(User)
    return (
        select(
            VerificationRequest,
            Organization.name,
            Supplier.id,
            Supplier.company_name,
            Supplier.city,
            submitter.full_name,
            submitter.email,
            decider.full_name,
        )
        .join(Organization, Organization.id == VerificationRequest.organization_id)
        .outerjoin(Supplier, Supplier.organization_id == VerificationRequest.organization_id)
        .join(submitter, submitter.id == VerificationRequest.submitted_by_id)
        .outerjoin(decider, decider.id == VerificationRequest.decided_by_id)
    )


async def _admin_items(db: AsyncSession, rows: Sequence[Any]) -> list[AdminVerificationOut]:
    files = await _files(db, [row[0].id for row in rows])
    return [
        AdminVerificationOut(
            **_out(request, files.get(request.id, [])).model_dump(),
            organization_id=request.organization_id,
            supplier_id=supplier_id,
            company_name=company_name or organization_name,
            city=city or "",
            submitted_by_name=submitter_name,
            submitted_by_email=submitter_email,
            decided_by_name=decider_name,
        )
        for (
            request,
            organization_name,
            supplier_id,
            company_name,
            city,
            submitter_name,
            submitter_email,
            decider_name,
        ) in rows
    ]


async def list_for_admin(
    db: AsyncSession, *, status: VerificationStatus | None, limit: int, offset: int
) -> AdminVerificationPage:
    stmt = _admin_select()
    count_stmt = select(func.count()).select_from(VerificationRequest)
    if status:
        stmt = stmt.where(VerificationRequest.status == status)
        count_stmt = count_stmt.where(VerificationRequest.status == status)
    # صف «در انتظار»: قدیمی‌ترین اول (به نوبت)؛ بقیه: تازه‌ترین اول
    order = (
        (VerificationRequest.created_at, VerificationRequest.id)
        if status == "pending"
        else (VerificationRequest.created_at.desc(), VerificationRequest.id.desc())
    )
    rows = (await db.execute(stmt.order_by(*order).limit(limit).offset(offset))).all()
    total = await db.scalar(count_stmt) or 0
    items = await _admin_items(db, rows)
    return AdminVerificationPage(items=items, total=total, limit=limit, offset=offset)


async def _admin_one(db: AsyncSession, request_id: uuid.UUID) -> AdminVerificationOut:
    rows = (await db.execute(_admin_select().where(VerificationRequest.id == request_id))).all()
    return (await _admin_items(db, rows))[0]


async def _lock(db: AsyncSession, request_id: uuid.UUID) -> tuple[VerificationRequest, Supplier]:
    found = await db.get(VerificationRequest, request_id)
    if found is None:
        raise NotFound(NOT_FOUND)
    supplier = await suppliers.supplier_for_organization(db, found.organization_id, for_update=True)
    # پس از قفل دوباره خوانده می‌شود تا تصمیم هم‌زمان ادمین دیگر دیده شود
    request = await db.scalar(
        select(VerificationRequest)
        .where(VerificationRequest.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if supplier is None or request is None:
        raise NotFound(NOT_FOUND)
    return request, supplier


async def decide(
    db: AsyncSession, admin: CurrentUser, request_id: uuid.UUID, *, approve: bool, reason: str
) -> AdminVerificationOut:
    if not approve and not reason:
        raise field_error("reason", REASON_REQUIRED)
    request, supplier = await _lock(db, request_id)
    if request.status != "pending":
        raise Conflict("این درخواست قبلاً بررسی شده است.", code="already_decided")
    now = utcnow()
    request.status = "approved" if approve else "rejected"
    request.decided_at = now
    request.decided_by_id = admin.id
    request.decision_reason = reason or None
    if approve:
        supplier.verified = True
        supplier.verified_at = now
    await notifications.notify(
        db,
        organization_id=request.organization_id,
        kind="verification_approved" if approve else "verification_rejected",
        title="شرکت شما تأیید شد" if approve else "درخواست تأیید هویت شرکت رد شد",
        body="نشان «تأییدشده» حالا در پروفایل عمومی شما نمایش داده می‌شود."
        if approve
        else f"دلیل: {reason}. می‌توانید مدارک را اصلاح کنید و دوباره بفرستید.",
        link="/profile",
    )
    audit.record(
        db,
        action="verification.approved" if approve else "verification.rejected",
        entity_type="verification_request",
        entity_id=request.id,
        actor_user_id=admin.id,
        organization_id=request.organization_id,
        data={"supplier_id": str(supplier.id)},
    )
    await db.commit()
    return await _admin_one(db, request.id)


async def revoke(
    db: AsyncSession, admin: CurrentUser, request_id: uuid.UUID, *, reason: str
) -> AdminVerificationOut:
    if not reason:
        raise field_error("reason", REASON_REQUIRED)
    request, supplier = await _lock(db, request_id)
    if request.status != "approved":
        raise Conflict("فقط درخواست تأییدشده را می‌توان لغو کرد.", code="not_approved")
    request.status = "revoked"
    request.revoked_at = utcnow()
    request.revoked_by_id = admin.id
    request.revoke_reason = reason
    supplier.verified = False
    supplier.verified_at = None
    await notifications.notify(
        db,
        organization_id=request.organization_id,
        kind="verification_revoked",
        title="تأیید شرکت شما لغو شد",
        body=f"دلیل: {reason}",
        link="/profile",
    )
    audit.record(
        db,
        action="verification.revoked",
        entity_type="verification_request",
        entity_id=request.id,
        actor_user_id=admin.id,
        organization_id=request.organization_id,
        data={"supplier_id": str(supplier.id)},
    )
    await db.commit()
    return await _admin_one(db, request.id)
