"""order payments — گام 3c فاز ۳

اقساط هر سفارش (order_payments) طبق شرایط پرداخت قرارداد امضاشده. پول از پلتفرم عبور نمی‌کند؛
فقط اعلام پرداخت (کارفرما) و تأیید یا رد دریافت (قطعه‌ساز) ثبت می‌شود. اقساط سفارش‌هایی که
قراردادشان پیش‌تر امضا شده، در اولین مشاهده ساخته می‌شوند.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-15 00:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "order_payments",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("percent", sa.Integer(), nullable=False),
        sa.Column("amount_rials", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_by_id", sa.Uuid(), nullable=True),
        sa.Column("paid_on", sa.Date(), nullable=True),
        sa.Column("reference", sa.String(length=100), server_default="", nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("receipt_file_id", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_id", sa.Uuid(), nullable=True),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("kind IN ('prepayment', 'final')", name=op.f("ck_order_payments_kind_valid")),
        sa.CheckConstraint(
            "status IN ('pending', 'reported', 'confirmed')",
            name=op.f("ck_order_payments_status_valid"),
        ),
        sa.CheckConstraint("amount_rials > 0", name=op.f("ck_order_payments_amount_positive")),
        sa.CheckConstraint(
            "percent BETWEEN 1 AND 100", name=op.f("ck_order_payments_percent_range")
        ),
        sa.CheckConstraint(
            "(status = 'pending') = (reported_at IS NULL)",
            name=op.f("ck_order_payments_reported_consistent"),
        ),
        sa.CheckConstraint(
            "(status = 'confirmed') = (confirmed_at IS NOT NULL)",
            name=op.f("ck_order_payments_confirmed_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["confirmed_by_id"],
            ["users.id"],
            name=op.f("fk_order_payments_confirmed_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_payments_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["receipt_file_id"],
            ["files.id"],
            name=op.f("fk_order_payments_receipt_file_id_files"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reported_by_id"],
            ["users.id"],
            name=op.f("fk_order_payments_reported_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_payments")),
        sa.UniqueConstraint("order_id", "number", name="uq_order_payments_order_number"),
    )
    op.create_index(
        op.f("ix_order_payments_order_id"), "order_payments", ["order_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_payments_order_id"), table_name="order_payments")
    op.drop_table("order_payments")
