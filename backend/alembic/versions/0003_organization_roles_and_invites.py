"""organization roles and invites — گام 2c فاز ۲

- users.org_role: نقش در سازمان (owner / member). کاربران موجود همه سازنده‌ی سازمان خودشان‌اند ⇒ owner.
- organization_invites: لینک دعوت یک‌بارمصرف (فقط هش توکن ذخیره می‌شود).

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-14 11:30:50.599951
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_invites",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_role", sa.String(length=20), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_by_id", sa.Uuid(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "user_role IN ('buyer', 'supplier', 'agent', 'qc')",
            name=op.f("ck_organization_invites_user_role_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["accepted_by_id"],
            ["users.id"],
            name=op.f("fk_organization_invites_accepted_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_organization_invites_created_by_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_organization_invites_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organization_invites")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_organization_invites_token_hash")),
    )
    op.create_index(
        op.f("ix_organization_invites_organization_id"),
        "organization_invites",
        ["organization_id"],
    )
    op.add_column(
        "users",
        sa.Column("org_role", sa.String(length=20), server_default="owner", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_users_org_role_valid"), "users", "org_role IN ('owner', 'member')"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_org_role_valid"), "users", type_="check")
    op.drop_column("users", "org_role")
    op.drop_index(
        op.f("ix_organization_invites_organization_id"), table_name="organization_invites"
    )
    op.drop_table("organization_invites")
