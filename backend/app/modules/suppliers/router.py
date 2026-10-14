"""قطعه‌سازها: فهرست و پروفایل عمومی (بدون نیاز به ورود)، و ویرایش پروفایل سازمان خود قطعه‌ساز."""

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import Capability
from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, require_roles
from app.modules.suppliers import service
from app.modules.suppliers.schemas import (
    MySupplierOut,
    SupplierOut,
    SupplierPage,
    SupplierProfileInput,
)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=SupplierPage)
async def list_suppliers(
    q: str | None = Query(default=None, max_length=100),
    capability: Capability | None = Query(default=None),
    city: str | None = Query(default=None, max_length=100),
    verified: bool | None = Query(default=None, description="فقط قطعه‌سازهای تأییدشده"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    db: AsyncSession = Depends(get_db),
) -> SupplierPage:
    items, total = await service.list_suppliers(
        db, q=q, capability=capability, city=city, verified=verified, limit=limit, offset=offset
    )
    return SupplierPage(items=items, total=total, limit=limit, offset=offset)


# مسیرهای /me پیش از /{supplier_id} تعریف می‌شوند تا «me» شناسه فرض نشود
@router.get("/me", response_model=MySupplierOut)
async def get_my_supplier(
    user: CurrentUser = Depends(require_roles("supplier")), db: AsyncSession = Depends(get_db)
) -> MySupplierOut:
    return await service.get_my_supplier(db, user)


@router.put("/me", response_model=MySupplierOut)
async def update_my_supplier(
    payload: SupplierProfileInput,
    user: CurrentUser = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
) -> MySupplierOut:
    return await service.update_my_supplier(db, user, payload)


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> SupplierOut:
    return await service.supplier_out(db, await service.get_supplier(db, supplier_id))


@router.get(
    "/{supplier_id}/images/{file_id}",
    response_class=StreamingResponse,
    responses={200: {"content": {"image/*": {}}}},
)
async def portfolio_image(
    supplier_id: uuid.UUID, file_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> StreamingResponse:
    """تصویر نمونه‌کار (عمومی). نوع واقعی تصویر هنگام بارگذاری از روی محتوا بررسی شده است."""
    stored, stream = await service.open_portfolio_image(db, supplier_id, file_id)
    return StreamingResponse(
        stream,
        media_type=stored.content_type,
        headers={
            "Content-Length": str(stored.size_bytes),
            "Cache-Control": "public, max-age=3600",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )
