import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.text import escape_like, normalize_search, normalize_text
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.schemas import SupplierOut
from app.modules.suppliers.trust_score import compute_trust_score


def trust_score(supplier: Supplier) -> dict[str, Any]:
    return compute_trust_score(
        on_time_delivery_rate=supplier.on_time_delivery_rate,
        quality_score=supplier.quality_score,
        satisfaction_score=supplier.satisfaction_score,
        response_time_hours=supplier.response_time_hours,
        dispute_count=supplier.dispute_count,
        completed_jobs=supplier.completed_jobs,
    )


def to_out(supplier: Supplier) -> SupplierOut:
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
            "on_time_delivery_rate": supplier.on_time_delivery_rate,
            "response_time_hours": supplier.response_time_hours,
            "verified": supplier.verified,
            "score": trust_score(supplier),
            "gallery_titles": supplier.gallery_titles or [],
        }
    )


async def list_suppliers(
    db: AsyncSession,
    *,
    q: str | None,
    capability: str | None,
    city: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Supplier], int]:
    """فیلتر و صفحه‌بندی کاملاً در پایگاه داده انجام می‌شود."""
    stmt = select(Supplier)
    if city:
        stmt = stmt.where(Supplier.city == normalize_text(city))
    if capability:
        stmt = stmt.where(Supplier.capabilities.contains([capability]))
    if q and normalize_search(q):
        pattern = f"%{escape_like(normalize_search(q))}%"
        stmt = stmt.where(Supplier.search_text.like(pattern, escape="\\"))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(Supplier.verified.desc(), Supplier.completed_jobs.desc(), Supplier.id)
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total


async def get_supplier(db: AsyncSession, supplier_id: uuid.UUID) -> Supplier:
    supplier = await db.get(Supplier, supplier_id)
    if supplier is None:
        raise NotFound("قطعه‌ساز موردنظر پیدا نشد.")
    return supplier


async def supplier_for_organization(
    db: AsyncSession, organization_id: uuid.UUID
) -> Supplier | None:
    return await db.scalar(select(Supplier).where(Supplier.organization_id == organization_id))
