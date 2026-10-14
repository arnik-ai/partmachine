"""وابستگی‌های احراز هویت: کاربر جاری (از access token) و کنترل نقش."""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db.session import get_db
from app.modules.identity.models import User

_bearer = HTTPBearer(auto_error=False, description="Access token (JWT)")

NOT_AUTHENTICATED = "برای ادامه وارد حساب کاربری شوید."
SESSION_EXPIRED = "نشست شما منقضی شده است. لطفاً دوباره وارد شوید."


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    organization_id: uuid.UUID
    role: str
    email: str
    full_name: str
    is_verified: bool
    org_role: str = "owner"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_org_owner(self) -> bool:
        return self.org_role == "owner"


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if creds is None:
        raise Unauthorized(NOT_AUTHENTICATED, headers={"WWW-Authenticate": "Bearer"})
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise Unauthorized(
            SESSION_EXPIRED, code="token_invalid", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except ValueError:
        raise Unauthorized(SESSION_EXPIRED, code="token_invalid") from None
    user = await db.get(User, user_id)
    if user is None or not user.is_active or payload.get("ver", 0) != user.token_version:
        raise Unauthorized(SESSION_EXPIRED, code="token_invalid")
    return CurrentUser(
        id=user.id,
        organization_id=user.organization_id,
        role=user.role,
        email=user.email,
        full_name=user.full_name,
        is_verified=user.is_verified,
        org_role=user.org_role,
    )


async def require_org_owner(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_org_owner:
        raise Forbidden("فقط مدیر سازمان می‌تواند این کار را انجام دهد.", code="not_org_owner")
    return user


def require_roles(*roles: str) -> Callable[..., Awaitable[CurrentUser]]:
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles and not user.is_admin:
            raise Forbidden("نقش کاربری شما اجازه‌ی این کار را ندارد.")
        return user

    return checker


def client_ip(request: Request) -> str:
    # پشت reverse proxy باید uvicorn با --proxy-headers اجرا شود تا IP واقعی برسد
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class ClientInfo:
    """IP و مرورگر درخواست — فقط برای شاهدِ پذیرش توافق‌ها ذخیره می‌شود."""

    ip: str
    user_agent: str


def client_info(request: Request) -> ClientInfo:
    return ClientInfo(
        ip=client_ip(request)[:64], user_agent=request.headers.get("user-agent", "")[:300]
    )


async def require_csrf(request: Request) -> None:
    """محافظت CSRF برای endpointهایی که با کوکی کار می‌کنند (refresh/logout).

    مرورگر برای درخواست cross-origin با هدر سفارشی preflight می‌فرستد و CORS فقط originهای
    مجاز را می‌پذیرد؛ بررسی Origin هم لایه‌ی دوم است.
    """
    if not request.headers.get("x-requested-with"):
        raise Forbidden("درخواست نامعتبر است.", code="csrf_failed")
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origin_list:
        raise Forbidden("درخواست نامعتبر است.", code="csrf_failed")
