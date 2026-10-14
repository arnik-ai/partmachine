"""مسیرهای ادمین. برای هر نقش دیگری 404 برمی‌گردانند (وجودشان پنهان می‌ماند)؛
بدون ورود یا با نشست منقضی همان 401 همیشگی تا فرانت نشست را تازه کند."""

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import Role
from app.core.errors import NotFound
from app.db.session import get_db
from app.modules.admin import service
from app.modules.admin.schemas import (
    AdminActionInput,
    AdminUserOut,
    AdminUserPage,
    AuditEventPage,
)
from app.modules.identity.deps import CurrentUser, get_current_user
from app.modules.verification import service as verification
from app.modules.verification.schemas import (
    AdminVerificationOut,
    AdminVerificationPage,
    DecisionInput,
    VerificationStatus,
)


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise NotFound("موردی که دنبالش بودید پیدا نشد.")
    return user


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/verifications", response_model=AdminVerificationPage)
async def list_verifications(
    status: VerificationStatus | Literal["all"] = Query(default="pending"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    db: AsyncSession = Depends(get_db),
) -> AdminVerificationPage:
    return await verification.list_for_admin(
        db, status=None if status == "all" else status, limit=limit, offset=offset
    )


@router.post("/verifications/{request_id}/approve", response_model=AdminVerificationOut)
async def approve_verification(
    request_id: uuid.UUID,
    payload: DecisionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminVerificationOut:
    return await verification.decide(db, admin, request_id, approve=True, reason=payload.reason)


@router.post("/verifications/{request_id}/reject", response_model=AdminVerificationOut)
async def reject_verification(
    request_id: uuid.UUID,
    payload: DecisionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminVerificationOut:
    return await verification.decide(db, admin, request_id, approve=False, reason=payload.reason)


@router.post("/verifications/{request_id}/revoke", response_model=AdminVerificationOut)
async def revoke_verification(
    request_id: uuid.UUID,
    payload: DecisionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminVerificationOut:
    return await verification.revoke(db, admin, request_id, reason=payload.reason)


@router.get("/users", response_model=AdminUserPage)
async def list_users(
    q: str | None = Query(default=None, max_length=100),
    role: Role | None = Query(default=None),
    active: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    db: AsyncSession = Depends(get_db),
) -> AdminUserPage:
    return await service.list_users(db, q=q, role=role, active=active, limit=limit, offset=offset)


@router.post("/users/{user_id}/deactivate", response_model=AdminUserOut)
async def deactivate_user(
    user_id: uuid.UUID,
    payload: AdminActionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    return await service.set_active(db, admin, user_id, active=False, reason=payload.reason)


@router.post("/users/{user_id}/activate", response_model=AdminUserOut)
async def activate_user(
    user_id: uuid.UUID,
    payload: AdminActionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    return await service.set_active(db, admin, user_id, active=True, reason=payload.reason)


@router.post("/users/{user_id}/verify", response_model=AdminUserOut)
async def verify_user(
    user_id: uuid.UUID,
    payload: AdminActionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    return await service.set_verified(db, admin, user_id, verified=True, reason=payload.reason)


@router.post("/users/{user_id}/unverify", response_model=AdminUserOut)
async def unverify_user(
    user_id: uuid.UUID,
    payload: AdminActionInput,
    admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    return await service.set_verified(db, admin, user_id, verified=False, reason=payload.reason)


@router.get("/audit-events", response_model=AuditEventPage)
async def list_audit_events(
    action: str | None = Query(default=None, max_length=64, pattern=r"^[a-z_.]+$"),
    actor: str | None = Query(default=None, max_length=255, description="ایمیل انجام‌دهنده"),
    organization_id: uuid.UUID | None = Query(default=None),
    entity_id: uuid.UUID | None = Query(default=None),
    since: date | None = Query(default=None),
    until: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=100_000),
    db: AsyncSession = Depends(get_db),
) -> AuditEventPage:
    return await service.list_audit_events(
        db,
        action=action,
        actor_email=actor,
        organization_id=organization_id,
        entity_id=entity_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
