"""disputes and mutual cancellation — گام 3f فاز ۳

- order_disputes: «اعلام مشکل» یکی از دو طرف پس از امضا و تصمیم ادمین با دلیل (O11)؛
  در هر لحظه حداکثر یک اختلاف باز برای هر سفارش.
- orders.cancel_requested_*: درخواست لغو یک طرف پس از امضا، در انتظار موافقت طرف دیگر (O11).

فقط افزودنی است؛ ستون‌های تازه‌ی orders همه nullable‌اند.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-15 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders", sa.Column("cancel_requested_side", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "orders", sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "orders", sa.Column("cancel_request_reason", sa.String(length=500), nullable=True)
    )
    op.create_check_constraint(
        op.f("ck_orders_cancel_requested_side_valid"),
        "orders",
        "cancel_requested_side IS NULL OR cancel_requested_side IN ('buyer', 'supplier')",
    )
    op.create_check_constraint(
        op.f("ck_orders_cancel_request_consistent"),
        "orders",
        "(cancel_requested_side IS NULL) = (cancel_requested_at IS NULL)",
    )

    op.create_table(
        "order_disputes",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("opened_side", sa.String(length=20), nullable=False),
        sa.Column("opened_by_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=True),
        sa.Column("previous_status", sa.String(length=30), nullable=False),
        sa.Column(
            "opened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("status", sa.String(length=20), server_default="open", nullable=False),
        sa.Column("resolution", sa.String(length=20), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("resolved_by_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "opened_side IN ('buyer', 'supplier')",
            name=op.f("ck_order_disputes_opened_side_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'resolved')", name=op.f("ck_order_disputes_status_valid")
        ),
        sa.CheckConstraint(
            "resolution IS NULL OR resolution IN ('resume', 'complete', 'cancel')",
            name=op.f("ck_order_disputes_resolution_valid"),
        ),
        sa.CheckConstraint(
            "(status = 'open') = (resolved_at IS NULL)",
            name=op.f("ck_order_disputes_resolved_consistent"),
        ),
        sa.CheckConstraint(
            "status = 'open' OR (resolution IS NOT NULL AND decision_reason IS NOT NULL "
            "AND resolved_by_id IS NOT NULL)",
            name=op.f("ck_order_disputes_decision_recorded"),
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["files.id"],
            name=op.f("fk_order_disputes_file_id_files"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["opened_by_id"],
            ["users.id"],
            name=op.f("fk_order_disputes_opened_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_disputes_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_id"],
            ["users.id"],
            name=op.f("fk_order_disputes_resolved_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_disputes")),
    )
    op.create_index(
        op.f("ix_order_disputes_order_id"), "order_disputes", ["order_id"], unique=False
    )
    op.create_index(
        "uq_order_disputes_open_order",
        "order_disputes",
        ["order_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_order_disputes_open_order", table_name="order_disputes")
    op.drop_index(op.f("ix_order_disputes_order_id"), table_name="order_disputes")
    op.drop_table("order_disputes")
    op.drop_constraint(op.f("ck_orders_cancel_request_consistent"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_cancel_requested_side_valid"), "orders", type_="check")
    op.drop_column("orders", "cancel_request_reason")
    op.drop_column("orders", "cancel_requested_at")
    op.drop_column("orders", "cancel_requested_side")
