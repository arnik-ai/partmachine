import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Sequence
from typing import Any

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, NotFound, field_error
from app.core.storage import get_storage
from app.core.text import escape_like, normalize_search, normalize_text
from app.modules.audit import service as audit
from app.modules.files.models import StoredFile
from app.modules.identity.deps import CurrentUser
from app.modules.organizations.models import Organization
from app.modules.suppliers import track_record
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.schemas import (
    MySupplierOut,
    PortfolioImageOut,
    SupplierOut,
    SupplierProfileInput,
)
from app.modules.suppliers.trust_score import compute_trust_score

NOT_FOUND = "قطعه‌ساز موردنظر پیدا نشد."
NAME_LOCKED = (
    "نام شرکت پس از تأیید هویت قفل می‌شود. برای تغییر آن با پشتیبانی پارت‌ماشین تماس بگیرید."
)

# فیلدهایی که قطعه‌ساز خودش ویرایش می‌کند (ورودی فرم ← ستون)
_EDITABLE = (
    "description",
    "city",
    "address",
    "phone",
    "website",
    "founded_year",
    "employee_count",
    "capabilities",
    "production_capacity_per_month",
    "lead_time_days",
)


def trust_score(supplier: Supplier) -> dict[str, Any]:
    return compute_trust_score(
        on_time_delivery_rate=supplier.on_time_delivery_rate,
        quality_score=supplier.quality_score,
        satisfaction_score=supplier.satisfaction_score,
        response_time_hours=supplier.response_time_hours,
        dispute_count=supplier.dispute_count,
        completed_jobs=supplier.completed_jobs,
        record=track_record.of(supplier),
    )


def is_listed(supplier: Supplier) -> bool:
    """پروفایل کامل (شهر و حداقل یک خدمت) در فهرست عمومی نمایش داده می‌شود."""
    return bool(supplier.city) and bool(supplier.capabilities)


def _listed_sql() -> ColumnElement[bool]:
    return and_(Supplier.city != "", func.jsonb_array_length(Supplier.capabilities) > 0)


def image_url(supplier_id: uuid.UUID, file_id: uuid.UUID) -> str:
    return f"/suppliers/{supplier_id}/images/{file_id}"


def to_out(supplier: Supplier, portfolio: Sequence[uuid.UUID] = ()) -> SupplierOut:
    return SupplierOut.model_validate(
        {
            "id": supplier.id,
            "company_name": supplier.company_name,
            "description": supplier.description,
            "city": supplier.city,
            "address": supplier.address,
            "phone": supplier.phone,
            "website": supplier.website,
            "founded_year": supplier.founded_year,
            "employee_count": supplier.employee_count,
            "capabilities": supplier.capabilities or [],
            "machines": supplier.machines or [],
            "certifications": supplier.certifications or [],
            "production_capacity_per_month": supplier.production_capacity_per_month,
            "lead_time_days": supplier.lead_time_days,
            "completed_jobs": supplier.completed_jobs,
            "delivered_jobs": supplier.delivered_jobs,
            "on_time_jobs": supplier.on_time_jobs,
            "rating_count": supplier.rating_count,
            "rating_average": track_record.of(supplier).rating_average,
            "on_time_delivery_rate": supplier.on_time_delivery_rate,
            "response_time_hours": supplier.response_time_hours,
            "verified": supplier.verified,
            "score": trust_score(supplier),
            "gallery_titles": supplier.gallery_titles or [],
            "portfolio": [
                PortfolioImageOut(id=file_id, url=image_url(supplier.id, file_id))
                for file_id in portfolio
            ],
        }
    )


async def portfolios(
    db: AsyncSession, organization_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """شناسه‌ی تصاویر نمونه‌کار هر سازمان، به ترتیب بارگذاری (یک کوئری برای کل صفحه)."""
    if not organization_ids:
        return {}
    rows = await db.execute(
        select(StoredFile.organization_id, StoredFile.id)
        .where(
            StoredFile.organization_id.in_(organization_ids),
            StoredFile.purpose == "portfolio_image",
        )
        .order_by(StoredFile.created_at, StoredFile.id)
    )
    result: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for organization_id, file_id in rows.all():
        result[organization_id].append(file_id)
    return result


async def list_suppliers(
    db: AsyncSession,
    *,
    q: str | None,
    capability: str | None,
    city: str | None,
    verified: bool | None,
    limit: int,
    offset: int,
) -> tuple[list[SupplierOut], int]:
    """فیلتر و صفحه‌بندی کاملاً در پایگاه داده انجام می‌شود؛ پروفایل‌های ناقص نمایش داده نمی‌شوند."""
    stmt = select(Supplier).where(_listed_sql())
    if city:
        stmt = stmt.where(Supplier.city == normalize_text(city))
    if capability:
        stmt = stmt.where(Supplier.capabilities.contains([capability]))
    if verified:
        stmt = stmt.where(Supplier.verified.is_(True))
    if q and normalize_search(q):
        pattern = f"%{escape_like(normalize_search(q))}%"
        stmt = stmt.where(Supplier.search_text.like(pattern, escape="\\"))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        await db.scalars(
            stmt.order_by(Supplier.verified.desc(), Supplier.completed_jobs.desc(), Supplier.id)
            .limit(limit)
            .offset(offset)
        )
    )
    images = await portfolios(db, [s.organization_id for s in rows])
    return [to_out(s, images.get(s.organization_id, [])) for s in rows], total


async def get_supplier(db: AsyncSession, supplier_id: uuid.UUID) -> Supplier:
    supplier = await db.get(Supplier, supplier_id)
    if supplier is None:
        raise NotFound(NOT_FOUND)
    return supplier


async def supplier_out(db: AsyncSession, supplier: Supplier) -> SupplierOut:
    images = await portfolios(db, [supplier.organization_id])
    return to_out(supplier, images.get(supplier.organization_id, []))


async def supplier_for_organization(
    db: AsyncSession, organization_id: uuid.UUID, *, for_update: bool = False
) -> Supplier | None:
    stmt = select(Supplier).where(Supplier.organization_id == organization_id)
    if for_update:
        stmt = stmt.with_for_update()
    return await db.scalar(stmt)


async def _my_supplier(
    db: AsyncSession, user: CurrentUser, *, for_update: bool = False
) -> Supplier:
    supplier = await supplier_for_organization(db, user.organization_id, for_update=for_update)
    if supplier is None:
        raise NotFound("سازمان شما پروفایل قطعه‌ساز ندارد.", code="no_supplier_profile")
    return supplier


async def _my_out(db: AsyncSession, user: CurrentUser, supplier: Supplier) -> MySupplierOut:
    public = await supplier_out(db, supplier)
    return MySupplierOut(
        **public.model_dump(), listed=is_listed(supplier), can_edit=user.is_org_owner
    )


async def get_my_supplier(db: AsyncSession, user: CurrentUser) -> MySupplierOut:
    return await _my_out(db, user, await _my_supplier(db, user))


async def update_my_supplier(
    db: AsyncSession, user: CurrentUser, data: SupplierProfileInput
) -> MySupplierOut:
    if not user.is_org_owner:
        raise Forbidden("فقط مدیر سازمان می‌تواند پروفایل شرکت را ویرایش کند.", code="not_org_owner")
    supplier = await _my_supplier(db, user, for_update=True)
    if data.company_name != supplier.company_name and supplier.verified:
        raise field_error("companyName", NAME_LOCKED)

    changed = [field for field in _EDITABLE if getattr(supplier, field) != getattr(data, field)]
    for field in _EDITABLE:
        setattr(supplier, field, getattr(data, field))
    machines = [m.model_dump() for m in data.machines]
    certifications = [
        {
            "title": c.title,
            "issuer": c.issuer,
            "valid_until": c.valid_until.isoformat() if c.valid_until else None,
        }
        for c in data.certifications
    ]
    if supplier.machines != machines:
        changed.append("machines")
    if supplier.certifications != certifications:
        changed.append("certifications")
    supplier.machines = machines
    supplier.certifications = certifications

    if data.company_name != supplier.company_name:
        changed.append("company_name")
        supplier.company_name = data.company_name
        # نام سازمان همان نام شرکت است (سربرگ، دعوت‌نامه‌ها و پیشنهادها)
        organization = await db.get(Organization, user.organization_id)
        assert organization is not None
        organization.name = data.company_name

    if changed:
        audit.record(
            db,
            action="supplier.profile_updated",
            entity_type="supplier",
            entity_id=supplier.id,
            actor_user_id=user.id,
            organization_id=user.organization_id,
            data={"fields": changed},
        )
    await db.commit()
    return await _my_out(db, user, supplier)


async def open_portfolio_image(
    db: AsyncSession, supplier_id: uuid.UUID, file_id: uuid.UUID
) -> tuple[StoredFile, AsyncIterator[bytes]]:
    """فقط تصویر نمونه‌کارِ همان قطعه‌ساز؛ هیچ فایل دیگری از این مسیر خوانده نمی‌شود."""
    supplier = await db.get(Supplier, supplier_id)
    stored = await db.get(StoredFile, file_id)
    if (
        supplier is None
        or stored is None
        or stored.purpose != "portfolio_image"
        or stored.organization_id != supplier.organization_id
    ):
        raise NotFound("تصویر موردنظر پیدا نشد.")
    return stored, get_storage().read(stored.storage_key)
