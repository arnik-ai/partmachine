"""two-factor sign-in (TOTP) — گام 4e فاز ۴

- users: کلید مخفی رمزگذاری‌شده، زمان روشن شدن و آخرین گام زمانی پذیرفته‌شده (هر کد یک بار).
- recovery_codes: کدهای پشتیبان یک‌بارمصرف؛ فقط هش آن‌ها.

فقط افزودنی است: همه‌ی حساب‌ها با ورود دومرحله‌ای خاموش شروع می‌کنند. ادمین‌ها پس از ورود باید
روشنش کنند تا بخش ادمین برایشان باز شود.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-15 19:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(length=300), nullable=True))
    op.add_column(
        "users", sa.Column("totp_enabled_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("totp_last_step", sa.BigInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_users_totp_consistent"),
        "users",
        "totp_enabled_at IS NULL OR totp_secret IS NOT NULL",
    )

    op.create_table(
        "recovery_codes",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_recovery_codes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_codes")),
    )
    op.create_index(
        op.f("ix_recovery_codes_user_id"), "recovery_codes", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_recovery_codes_user_id"), table_name="recovery_codes")
    op.drop_table("recovery_codes")
    op.drop_constraint(op.f("ck_users_totp_consistent"), "users", type_="check")
    op.drop_column("users", "totp_last_step")
    op.drop_column("users", "totp_enabled_at")
    op.drop_column("users", "totp_secret")
