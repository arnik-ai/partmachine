"""مسیرهای احراز هویت.

نشست مرورگر: access token کوتاه‌عمر در بدنه‌ی پاسخ (فقط در حافظه‌ی فرانت) و refresh token
در کوکی HttpOnly با مسیر محدود `/api/v1/auth`. فرانت با هر بار باز شدن سایت یک‌بار
`POST /auth/refresh` می‌زند و کاربر بدون ورود دوباره وارد می‌ماند.
"""

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import AppError, Unauthorized, error_body
from app.db.session import get_db
from app.modules.identity import service
from app.modules.identity.deps import CurrentUser, client_ip, get_current_user, require_csrf
from app.modules.identity.schemas import AuthSession, LoginInput, RegisterInput, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "pm_refresh"


def _cookie_path() -> str:
    return f"{settings.api_v1_prefix}/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path=_cookie_path(),
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=_cookie_path(),
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )


@router.post("/register", response_model=AuthSession, status_code=201)
async def register(
    payload: RegisterInput, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> AuthSession:
    await rate_limit.hit(rate_limit.REGISTER_PER_IP, client_ip(request))
    issued = await service.register(db, payload)
    _set_refresh_cookie(response, issued.refresh_token)
    return issued.session


@router.post("/login", response_model=AuthSession)
async def login(
    payload: LoginInput, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> AuthSession:
    await rate_limit.hit(rate_limit.LOGIN_PER_IP, client_ip(request))
    issued = await service.login(db, payload.email, payload.password)
    _set_refresh_cookie(response, issued.refresh_token)
    return issued.session


@router.post(
    "/refresh",
    response_model=AuthSession,
    dependencies=[Depends(require_csrf)],
    responses={401: {"description": "نشست فعالی وجود ندارد یا منقضی شده است"}},
)
async def refresh(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> AuthSession | JSONResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise Unauthorized("نشست فعالی وجود ندارد.", code="no_session")
    await rate_limit.hit(rate_limit.REFRESH_PER_IP, client_ip(request))
    try:
        issued = await service.refresh(db, raw)
    except AppError as exc:
        failed = JSONResponse(error_body(exc.detail, exc.code), status_code=exc.status_code)
        _clear_refresh_cookie(failed)
        return failed
    _set_refresh_cookie(response, issued.refresh_token)
    return issued.session


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf)])
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        await service.logout(db, raw)
    response = Response(status_code=204)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
async def me(
    user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> UserOut:
    return await service.current_profile(db, user.id)
