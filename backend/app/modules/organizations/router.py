"""مسیرهای سازمان: اعضا، دعوت با لینک و حذف عضو؛ و اطلاعات عمومی یک دعوت برای ثبت‌نام."""

import uuid

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.deps import CurrentUser, get_current_user, require_org_owner
from app.modules.organizations import service
from app.modules.organizations.schemas import (
    InviteCreatedOut,
    InviteInfoOut,
    InviteOut,
    OrganizationOut,
)

router = APIRouter(tags=["organizations"])


@router.get("/organization", response_model=OrganizationOut)
async def get_organization(
    user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> OrganizationOut:
    return await service.get_organization(db, user)


@router.get("/organization/invites", response_model=list[InviteOut])
async def list_invites(
    user: CurrentUser = Depends(require_org_owner), db: AsyncSession = Depends(get_db)
) -> list[InviteOut]:
    return await service.list_invites(db, user)


@router.post("/organization/invites", response_model=InviteCreatedOut, status_code=201)
async def create_invite(
    user: CurrentUser = Depends(require_org_owner), db: AsyncSession = Depends(get_db)
) -> InviteCreatedOut:
    return await service.create_invite(db, user)


@router.delete("/organization/invites/{invite_id}", status_code=204)
async def revoke_invite(
    invite_id: uuid.UUID,
    user: CurrentUser = Depends(require_org_owner),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.revoke_invite(db, user, invite_id)
    return Response(status_code=204)


@router.delete("/organization/members/{member_id}", status_code=204)
async def remove_member(
    member_id: uuid.UUID,
    user: CurrentUser = Depends(require_org_owner),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.remove_member(db, user, member_id)
    return Response(status_code=204)


@router.get("/invites/{token}", response_model=InviteInfoOut)
async def invite_info(
    token: str = Path(min_length=16, max_length=128), db: AsyncSession = Depends(get_db)
) -> InviteInfoOut:
    return await service.invite_info(db, token)
