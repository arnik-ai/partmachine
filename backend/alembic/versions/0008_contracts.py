"""contracts — گام 3b فاز ۳

قرارداد هر سفارش (contracts)، نسخه‌های تغییرناپذیر با هش (contract_versions) و شاهد امضای مدیر
هر طرف (contract_signatures). قرارداد سفارش‌های موجود در اولین مشاهده ساخته می‌شود.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-14 22:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("current_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_contracts_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contracts")),
        sa.UniqueConstraint("order_id", name=op.f("uq_contracts_order_id")),
    )
    op.create_table(
        "contract_versions",
        sa.Column("contract_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("delivery_due", sa.Date(), nullable=False),
        sa.Column("prepayment_percent", sa.Integer(), nullable=False),
        sa.Column("penalty_per_day_bp", sa.Integer(), nullable=False),
        sa.Column("penalty_cap_percent", sa.Integer(), nullable=False),
        sa.Column("articles", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("template_version", sa.String(length=20), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("change_note", sa.Text(), server_default="", nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("number >= 1", name=op.f("ck_contract_versions_number_positive")),
        sa.CheckConstraint(
            "prepayment_percent BETWEEN 0 AND 100",
            name=op.f("ck_contract_versions_prepayment_percent_range"),
        ),
        sa.CheckConstraint(
            "penalty_per_day_bp BETWEEN 0 AND 1000", name=op.f("ck_contract_versions_penalty_range")
        ),
        sa.CheckConstraint(
            "penalty_cap_percent BETWEEN 0 AND 100",
            name=op.f("ck_contract_versions_penalty_cap_range"),
        ),
        sa.ForeignKeyConstraint(
            ["contract_id"],
            ["contracts.id"],
            name=op.f("fk_contract_versions_contract_id_contracts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_contract_versions_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contract_versions")),
        sa.UniqueConstraint(
            "contract_id", "number", name="uq_contract_versions_contract_number"
        ),
    )
    op.create_index(
        op.f("ix_contract_versions_contract_id"), "contract_versions", ["contract_id"], unique=False
    )
    op.create_table(
        "contract_signatures",
        sa.Column("version_id", sa.Uuid(), nullable=False),
        sa.Column("side", sa.String(length=20), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.String(length=300), nullable=False),
        sa.Column(
            "signed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "side IN ('buyer', 'supplier')", name=op.f("ck_contract_signatures_side_valid")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_contract_signatures_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_contract_signatures_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["contract_versions.id"],
            name=op.f("fk_contract_signatures_version_id_contract_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contract_signatures")),
        sa.UniqueConstraint("version_id", "side", name="uq_contract_signatures_version_side"),
    )
    op.create_index(
        op.f("ix_contract_signatures_version_id"),
        "contract_signatures",
        ["version_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_contract_signatures_version_id"), table_name="contract_signatures")
    op.drop_table("contract_signatures")
    op.drop_index(op.f("ix_contract_versions_contract_id"), table_name="contract_versions")
    op.drop_table("contract_versions")
    op.drop_table("contracts")
