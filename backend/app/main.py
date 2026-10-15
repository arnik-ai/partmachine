"""نقطه‌ی ورود FastAPI.

اجرای محلی:  uvicorn app.main:app --reload --port 8100
در تولید پشت reverse proxy:  uvicorn app.main:app --proxy-headers --forwarded-allow-ips=<proxy-ip>
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core import metrics
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.core.health import components
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.core.redis import close_redis
from app.core.schemas import ErrorResponse
from app.db.session import engine
from app.modules.admin.router import router as admin_router
from app.modules.agreements.router import router as agreements_router
from app.modules.contracts.router import router as contracts_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.disputes.router import router as disputes_router
from app.modules.files.router import router as files_router
from app.modules.identity.router import router as auth_router
from app.modules.inspections.router import router as inspections_router
from app.modules.notifications.router import router as notifications_router
from app.modules.orders.router import router as orders_router
from app.modules.organizations.router import router as organizations_router
from app.modules.payments.router import router as payments_router
from app.modules.pricing.router import router as pricing_router
from app.modules.quotations.router import router as quotations_router
from app.modules.ratings.router import router as ratings_router
from app.modules.rfqs.router import router as rfqs_router
from app.modules.suppliers.router import router as suppliers_router
from app.modules.verification.router import router as verification_router

logger = logging.getLogger("partmachine")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("starting (environment=%s)", settings.environment)
    yield
    await close_redis()
    await engine.dispose()


def build_api_router() -> APIRouter:
    # همه‌ی خطاها شکل یکسان ErrorResponse دارند؛ در OpenAPI هم همین ثبت می‌شود
    error_codes = (400, 401, 403, 404, 409, 413, 422, 429)
    api = APIRouter(responses={code: {"model": ErrorResponse} for code in error_codes})
    for router in (
        auth_router,
        agreements_router,
        organizations_router,
        files_router,
        suppliers_router,
        verification_router,
        rfqs_router,
        quotations_router,
        orders_router,
        contracts_router,
        payments_router,
        inspections_router,
        notifications_router,
        dashboard_router,
        disputes_router,
        ratings_router,
        pricing_router,
        admin_router,
    ):
        api.include_router(router)
    return api


async def health() -> dict[str, str]:
    """زنده بودن پروسه (liveness) — به هیچ وابستگی بیرونی سر نمی‌زند."""
    return {"status": "ok"}


async def ready() -> JSONResponse:
    """آمادگی دریافت ترافیک (readiness): پایگاه داده و Redis."""
    checks = {name: "ok" if ok else "unavailable" for name, ok in (await components()).items()}
    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(
        {"status": "ok" if healthy else "unavailable", "checks": checks},
        status_code=200 if healthy else 503,
    )


async def metrics_endpoint() -> PlainTextResponse:
    """آمار در قالب Prometheus؛ فقط از داخل سرور (Caddy این مسیر را بیرون نمی‌برد)."""
    return PlainTextResponse(
        await metrics.render(), media_type="text/plain; version=0.0.4; charset=utf-8"
    )


async def public_status() -> JSONResponse:
    """برای سرویس‌های بیرونی پایش در دسترس بودن: فقط «بالا» یا «پایین»، بدون جزئیات."""
    healthy = all((await components()).values())
    return JSONResponse(
        {"status": "ok" if healthy else "unavailable"}, status_code=200 if healthy else 503
    )


def create_app() -> FastAPI:
    problems = settings.problems()
    if problems:
        raise RuntimeError("Unsafe configuration:\n- " + "\n- ".join(problems))
    configure_logging(settings)

    app = FastAPI(
        title=settings.app_name,
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.show_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.show_docs else None,
    )
    install_error_handlers(app)

    # ترتیب: آخرین middleware بیرونی‌ترین است ⇒ RequestContext همه‌ی پاسخ‌ها را برچسب می‌زند
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    if "*" not in settings.allowed_host_list:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
    app.add_middleware(
        RequestContextMiddleware,
        max_body_bytes=settings.max_body_bytes,
        upload_paths=(f"{settings.api_v1_prefix}/files",),
        upload_max_bytes=settings.upload_max_bytes,
        route_prefix=settings.api_v1_prefix,
    )

    app.include_router(build_api_router(), prefix=settings.api_v1_prefix)
    app.add_api_route("/health", health, methods=["GET"], tags=["system"])
    app.add_api_route("/ready", ready, methods=["GET"], tags=["system"])
    app.add_api_route("/metrics", metrics_endpoint, methods=["GET"], include_in_schema=False)
    app.add_api_route(
        f"{settings.api_v1_prefix}/status", public_status, methods=["GET"], tags=["system"]
    )
    return app


app = create_app()
