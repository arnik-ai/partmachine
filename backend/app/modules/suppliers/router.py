"""فهرست عمومی قطعه‌سازها — اطلاعات بازاریابی و عمومی، بدون نیاز به ورود."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import Capability
from app.db.session import get_db
from app.modules.suppliers import service
from app.modules.suppliers.schemas import SupplierOut, SupplierPage

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=SupplierPage)
async def list_suppliers(
    q: str | None = Query(default=None, max_length=100),
    capability: Capability | None = Query(default=None),
    city: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    db: AsyncSession = Depends(get_db),
) -> SupplierPage:
    rows, total = await service.list_suppliers(
        db, q=q, capability=capability, city=city, limit=limit, offset=offset
    )
    return SupplierPage(
        items=[service.to_out(s) for s in rows], total=total, limit=limit, offset=offset
    )


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> SupplierOut:
    return service.to_out(await service.get_supplier(db, supplier_id))
