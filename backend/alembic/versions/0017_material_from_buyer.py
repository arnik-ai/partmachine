"""buyer-supplied part: the order waits for it and the deadline starts on arrival

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-16 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BEFORE = "'awaiting_contract', 'awaiting_prepayment', "
_AFTER = "'in_production', 'in_inspection', 'shipped', 'delivered', 'completed', 'cancelled', 'disputed'"
OLD_STATUSES = f"status IN ({_BEFORE}{_AFTER})"
NEW_STATUSES = f"status IN ({_BEFORE}'awaiting_material', {_AFTER})"


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("material_from_buyer", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("orders", sa.Column("material_received_at", sa.Date(), nullable=True))
    op.add_column(
        "contract_versions",
        sa.Column("material_from_buyer", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.drop_constraint(op.f("ck_orders_status_valid"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status_valid"), "orders", NEW_STATUSES)


def downgrade() -> None:
    # نسخه‌ی قبلی این مرحله را ندارد؛ سفارش‌های منتظر قطعه به تولید برمی‌گردند
    op.execute("UPDATE orders SET status = 'in_production' WHERE status = 'awaiting_material'")
    op.drop_constraint(op.f("ck_orders_status_valid"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status_valid"), "orders", OLD_STATUSES)
    op.drop_column("contract_versions", "material_from_buyer")
    op.drop_column("orders", "material_received_at")
    op.drop_column("orders", "material_from_buyer")
