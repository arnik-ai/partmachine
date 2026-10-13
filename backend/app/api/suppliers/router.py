"""مسیرهای تأمین‌کنندگان: لیست با فیلتر + جزئیات، همراه امتیاز اعتماد محاسبه‌شده."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.suppliers.schemas import SupplierOut
from app.db.session import get_db
from app.models import Supplier
from app.services.trust_score import compute_trust_score

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _to_out(supplier: Supplier) -> SupplierOut:
    score = compute_trust_score(
        on_time_delivery_rate=supplier.on_time_delivery_rate,
        quality_score=supplier.quality_score,
        satisfaction_score=supplier.satisfaction_score,
        response_time_hours=supplier.response_time_hours,
        dispute_count=supplier.dispute_count,
        completed_jobs=supplier.completed_jobs,
    )
    return SupplierOut(
        id=supplier.id,
        company_name=supplier.company_name,
        description=supplier.description,
        city=supplier.city,
        address=supplier.address,
        phone=supplier.phone,
        website=supplier.website,
        founded_year=supplier.founded_year,
        employee_count=supplier.employee_count,
        capabilities=supplier.capabilities or [],
        machines=supplier.machines or [],
        certifications=supplier.certifications or [],
        production_capacity_per_month=supplier.production_capacity_per_month,
        lead_time_days=supplier.lead_time_days,
        completed_jobs=supplier.completed_jobs,
        on_time_delivery_rate=supplier.on_time_delivery_rate,
        response_time_hours=supplier.response_time_hours,
        verified=supplier.verified,
        score=score,
        gallery_titles=supplier.gallery_titles or [],
    )


@router.get("", response_model=list[SupplierOut])
async def list_suppliers(
    q: str | None = Query(default=None),
    capability: str | None = Query(default=None),
    city: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Supplier)
    if city:
        stmt = stmt.where(Supplier.city == city)

    suppliers = list(await db.scalars(stmt))

    # فیلترهای متن و توانمندی روی پایتون (capabilities به‌صورت JSON ذخیره شده)
    if q:
        suppliers = [
            s
            for s in suppliers
            if q in f"{s.company_name} {s.description}"
        ]
    if capability:
        suppliers = [s for s in suppliers if capability in (s.capabilities or [])]

    return [_to_out(s) for s in suppliers]


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)):
    supplier = await db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="تأمین‌کننده یافت نشد"
        )
    return _to_out(supplier)
