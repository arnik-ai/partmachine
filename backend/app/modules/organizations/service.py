"""سازمان و اعضا: فهرست اعضا، دعوت با لینک یک‌بارمصرف، ابطال دعوت و حذف عضو."""

import secrets
import uuid
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.security import hash_token
from app.core.time import utcnow
from app.modules.audit import service as audit
from app.modules.identity.deps import CurrentUser
from app.modules.identity.models import RefreshToken, User
from app.modules.organizations.models import Organization, OrganizationInvite
from app.modules.organizations.schemas import (
    InviteCreatedOut,
    InviteInfoOut,
    InviteOut,
    MemberOut,
    OrganizationOut,
)

INVITE_TTL = timedelta(days=7)
MAX_ACTIVE_INVITES = 20
INVITE_INVALID = "این لینک دعوت معتبر نیست، استفاده شده یا منقضی شده است."


async def get_organization(db: AsyncSession, user: CurrentUser) -> OrganizationOut:
    organization = await db.get(Organization, user.organization_id)
    assert organization is not None
    members = await db.scalars(
        select(User)
        .where(User.organization_id == organization.id, User.is_active.is_(True))
        .order_by(User.created_at, User.id)
    )
    return OrganizationOut(
        id=organization.id,
        name=organization.name,
        my_org_role=user.org_role,
        members=[
            MemberOut(
                id=m.id,
                full_name=m.full_name,
                email=m.email,
                role=m.role,
                org_role=m.org_role,
                joined_at=m.created_at,
            )
            for m in members
        ],
    )


def _active_invites(organization_id: uuid.UUID):  # type: ignore[no-untyped-def]
    now = utcnow()
    return select(OrganizationInvite).where(
        OrganizationInvite.organization_id == organization_id,
        OrganizationInvite.accepted_at.is_(None),
        OrganizationInvite.revoked_at.is_(None),
        OrganizationInvite.expires_at > now,
    )


async def list_invites(db: AsyncSession, user: CurrentUser) -> list[InviteOut]:
    rows = await db.execute(
        _active_invites(user.organization_id)
        .add_columns(User.full_name)
        .join(User, User.id == OrganizationInvite.created_by_id)
        .order_by(OrganizationInvite.created_at.desc())
    )
    return [
        InviteOut(
            id=invite.id,
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            created_by_name=name,
        )
        for invite, name in rows.all()
    ]


async def create_invite(db: AsyncSession, user: CurrentUser) -> InviteCreatedOut:
    active = await db.scalar(
        select(func.count()).select_from(_active_invites(user.organization_id).subquery())
    )
    if (active or 0) >= MAX_ACTIVE_INVITES:
        raise Conflict(
            "تعداد دعوت‌های فعال زیاد است. ابتدا دعوت‌های استفاده‌نشده را باطل کنید.",
            code="too_many_invites",
        )
    token = secrets.token_urlsafe(32)
    invite = OrganizationInvite(
        id=uuid.uuid4(),
        organization_id=user.organization_id,
        token_hash=hash_token(token),
        user_role=user.role,
        created_by_id=user.id,
        created_at=utcnow(),
        expires_at=utcnow() + INVITE_TTL,
    )
    db.add(invite)
    audit.record(
        db,
        action="organization.invite_created",
        entity_type="organization",
        entity_id=user.organization_id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
        data={"invite_id": str(invite.id)},
    )
    await db.commit()
    return InviteCreatedOut(
        id=invite.id,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        created_by_name=user.full_name,
        token=token,
    )


async def revoke_invite(db: AsyncSession, user: CurrentUser, invite_id: uuid.UUID) -> None:
    invite = await db.get(OrganizationInvite, invite_id)
    if invite is None or invite.organization_id != user.organization_id:
        raise NotFound("دعوت موردنظر پیدا نشد.")
    if invite.revoked_at is None and invite.accepted_at is None:
        invite.revoked_at = utcnow()
        audit.record(
            db,
            action="organization.invite_revoked",
            entity_type="organization",
            entity_id=user.organization_id,
            actor_user_id=user.id,
            organization_id=user.organization_id,
            data={"invite_id": str(invite.id)},
        )
        await db.commit()


async def remove_member(db: AsyncSession, user: CurrentUser, member_id: uuid.UUID) -> None:
    """عضو را غیرفعال می‌کند و همه‌ی نشست‌هایش را باطل می‌کند؛ دسترسی بلافاصله قطع می‌شود."""
    member = await db.get(User, member_id)
    if member is None or member.organization_id != user.organization_id or not member.is_active:
        raise NotFound("عضو موردنظر پیدا نشد.")
    if member.id == user.id:
        raise Conflict("نمی‌توانید خودتان را از سازمان حذف کنید.", code="cannot_remove_self")
    if member.org_role == "owner":
        raise Conflict("مدیر سازمان را نمی‌توان حذف کرد.", code="cannot_remove_owner")
    member.is_active = False
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == member.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    audit.record(
        db,
        action="organization.member_removed",
        entity_type="user",
        entity_id=member.id,
        actor_user_id=user.id,
        organization_id=user.organization_id,
    )
    await db.commit()


async def find_usable_invite(
    db: AsyncSession, token: str, *, for_update: bool = False
) -> OrganizationInvite | None:
    stmt = select(OrganizationInvite).where(OrganizationInvite.token_hash == hash_token(token))
    if for_update:
        stmt = stmt.with_for_update()
    invite = await db.scalar(stmt)
    return invite if invite is not None and invite.is_usable(utcnow()) else None


async def invite_info(db: AsyncSession, token: str) -> InviteInfoOut:
    invite = await find_usable_invite(db, token)
    if invite is None:
        raise NotFound(INVITE_INVALID, code="invite_invalid")
    organization = await db.get(Organization, invite.organization_id)
    inviter = await db.get(User, invite.created_by_id)
    assert organization is not None and inviter is not None
    return InviteInfoOut(
        organization_name=organization.name,
        role=invite.user_role,
        inviter_name=inviter.full_name,
        expires_at=invite.expires_at,
    )
