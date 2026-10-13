"""مسیرهای احراز هویت: ثبت‌نام، ورود، تازه‌سازی توکن، کاربر جاری."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.schemas import (
    AuthResponse,
    LoginInput,
    RefreshInput,
    RegisterInput,
    UserOut,
)
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models import RefreshToken, Supplier, User

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_ROLES = {"buyer", "supplier", "agent", "qc"}


async def _store_refresh_token(db: AsyncSession, user_id: str, token: str) -> None:
    expires = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    db.add(RefreshToken(user_id=user_id, token=token, expires_at=expires))


def _issue_tokens(user: User) -> dict[str, str]:
    return {
        "accessToken": create_access_token(user.id, user.role),
        "refreshToken": create_refresh_token(user.id),
    }


def _auth_response(user: User, tokens: dict[str, str]) -> AuthResponse:
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterInput, db: AsyncSession = Depends(get_db)):
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail="نقش نامعتبر است")

    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این ایمیل قبلاً ثبت شده است",
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        company_name=payload.company_name,
    )
    db.add(user)
    await db.flush()  # تا user.id مقداردهی شود

    # برای قطعه‌ساز، رکورد پروفایل پایه ساخته می‌شود تا در لیست دیده شود
    if payload.role == "supplier" and payload.company_name:
        db.add(
            Supplier(
                owner_id=user.id,
                company_name=payload.company_name,
                city="",
            )
        )

    tokens = _issue_tokens(user)
    await _store_refresh_token(db, user.id, tokens["refreshToken"])
    await db.commit()
    await db.refresh(user)
    return _auth_response(user, tokens)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginInput, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ایمیل یا رمز عبور نادرست است",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="حساب غیرفعال است"
        )

    tokens = _issue_tokens(user)
    await _store_refresh_token(db, user.id, tokens["refreshToken"])
    await db.commit()
    return _auth_response(user, tokens)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(payload: RefreshInput, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if data is None or data.get("type") != REFRESH_TOKEN_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="توکن نامعتبر است"
        )

    stored = await db.scalar(
        select(RefreshToken).where(RefreshToken.token == payload.refresh_token)
    )
    if stored is None or stored.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست منقضی یا باطل شده است",
        )

    user = await db.get(User, data.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="کاربر یافت نشد"
        )

    # چرخش توکن: قبلی باطل، جدید صادر می‌شود (تشخیص استفاده‌ی مجدد)
    stored.revoked = True
    tokens = _issue_tokens(user)
    await _store_refresh_token(db, user.id, tokens["refreshToken"])
    await db.commit()
    return _auth_response(user, tokens)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
