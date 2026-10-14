import uuid
from datetime import datetime
from typing import Literal

from app.core.catalog import Role, SignupRole
from app.core.schemas import CamelModel

OrgRole = Literal["owner", "member"]


class MemberOut(CamelModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: Role
    org_role: OrgRole
    joined_at: datetime


class OrganizationOut(CamelModel):
    id: uuid.UUID
    name: str
    my_org_role: OrgRole
    members: list[MemberOut]


class InviteOut(CamelModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    created_by_name: str


class InviteCreatedOut(InviteOut):
    """فقط همین یک‌بار توکن خام برگردانده می‌شود تا مدیر لینک را کپی کند."""

    token: str


class InviteInfoOut(CamelModel):
    """اطلاعات عمومی یک دعوت معتبر، برای نمایش در صفحه‌ی ثبت‌نام."""

    organization_name: str
    role: SignupRole
    inviter_name: str
    expires_at: datetime
