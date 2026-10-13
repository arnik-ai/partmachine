"""روتر اصلی API نسخه ۱ — همه‌ی زیرروترها را جمع می‌کند."""

from fastapi import APIRouter

from app.api.auth.router import router as auth_router
from app.api.pricing.router import router as pricing_router
from app.api.quotations.router import router as quotations_router
from app.api.rfqs.router import router as rfqs_router
from app.api.suppliers.router import router as suppliers_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(suppliers_router)
api_router.include_router(rfqs_router)
api_router.include_router(quotations_router)
api_router.include_router(pricing_router)
