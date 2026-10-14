"""orders — گام 3a فاز ۳

جدول‌های orders (سفارش پس از انتخاب برنده) و order_events (تاریخچه)، اسناد سفارش در files
(purpose='order_document' و files.order_id). برای RFQهای برنده‌دار موجود هم سفارش ساخته می‌شود
تا قاعده‌ی «هر برنده دقیقاً یک سفارش» از همین ابتدا برقرار باشد. داده‌ی موجود حذف نمی‌شود.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-14 20:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ORDER_STATUSES = (
    "'awaiting_contract', 'awaiting_prepayment', 'in_production', 'in_inspection', 'shipped', "
    "'delivered', 'completed', 'cancelled', 'disputed'"
)
OLD_PURPOSES = "purpose IN ('rfq_attachment', 'verification_document', 'portfolio_image')"
NEW_PURPOSES = (
    "purpose IN ('rfq_attachment', 'verification_document', 'portfolio_image', 'order_document')"
)


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("number", sa.BigInteger(), sa.Identity(always=False, start=1001), nullable=False),
        sa.Column("rfq_id", sa.Uuid(), nullable=False),
        sa.Column("quotation_id", sa.Uuid(), nullable=False),
        sa.Column("buyer_organization_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_organization_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("material", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("delivery_city", sa.String(length=100), nullable=False),
        sa.Column("amount_rials", sa.BigInteger(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("delivery_due", sa.Date(), nullable=False),
        sa.Column(
            "status", sa.String(length=30), server_default="awaiting_contract", nullable=False
        ),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(f"status IN ({ORDER_STATUSES})", name=op.f("ck_orders_status_valid")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_orders_quantity_positive")),
        sa.CheckConstraint("amount_rials > 0", name=op.f("ck_orders_amount_positive")),
        sa.CheckConstraint(
            "buyer_organization_id <> supplier_organization_id",
            name=op.f("ck_orders_distinct_parties"),
        ),
        sa.CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)",
            name=op.f("ck_orders_cancelled_consistent"),
        ),
        sa.CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)",
            name=op.f("ck_orders_completed_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["buyer_organization_id"],
            ["organizations.id"],
            name=op.f("fk_orders_buyer_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["quotation_id"],
            ["quotations.id"],
            name=op.f("fk_orders_quotation_id_quotations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["rfq_id"], ["rfqs.id"], name=op.f("fk_orders_rfq_id_rfqs"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_orders_supplier_id_suppliers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_organization_id"],
            ["organizations.id"],
            name=op.f("fk_orders_supplier_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orders")),
        sa.UniqueConstraint("number", name=op.f("uq_orders_number")),
        sa.UniqueConstraint("quotation_id", name=op.f("uq_orders_quotation_id")),
        sa.UniqueConstraint("rfq_id", name=op.f("uq_orders_rfq_id")),
    )
    op.create_index(
        op.f("ix_orders_buyer_organization_id"), "orders", ["buyer_organization_id"], unique=False
    )
    op.create_index(
        op.f("ix_orders_supplier_organization_id"),
        "orders",
        ["supplier_organization_id"],
        unique=False,
    )

    # اسناد سفارش در جدول فایل‌ها (پیش از order_events که به files ارجاع می‌دهد)
    op.drop_constraint(op.f("ck_files_purpose_valid"), "files", type_="check")
    op.create_check_constraint(op.f("ck_files_purpose_valid"), "files", NEW_PURPOSES)
    op.add_column("files", sa.Column("order_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_files_order_id"), "files", ["order_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_files_order_id_orders"),
        "files",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "order_events",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("actor_side", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "actor_side IN ('buyer', 'supplier', 'qc', 'admin', 'system')",
            name=op.f("ck_order_events_actor_side_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_order_events_actor_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["files.id"],
            name=op.f("fk_order_events_file_id_files"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_events_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_events")),
    )
    op.create_index(op.f("ix_order_events_order_id"), "order_events", ["order_id"], unique=False)

    # RFQهای برنده‌دار قبلی هم سفارش می‌گیرند (فقط داده‌ی توسعه وجود دارد؛ D8)
    op.execute(
        """
        INSERT INTO orders (
            id, rfq_id, quotation_id, buyer_organization_id, supplier_organization_id,
            supplier_id, title, material, quantity, delivery_city, amount_rials,
            lead_time_days, delivery_due, status
        )
        SELECT gen_random_uuid(), r.id, q.id, r.organization_id, s.organization_id, s.id,
               r.title, r.material, r.quantity, r.delivery_city, q.total_price_rials,
               q.lead_time_days, CURRENT_DATE + q.lead_time_days, 'awaiting_contract'
        FROM rfqs r
        JOIN quotations q ON q.id = r.awarded_quotation_id
        JOIN suppliers s ON s.id = q.supplier_id
        WHERE r.status = 'awarded'
        ORDER BY r.created_at
        """
    )
    op.execute(
        """
        INSERT INTO order_events (id, order_id, action, from_status, to_status, actor_side, note)
        SELECT gen_random_uuid(), o.id, 'created', NULL, 'awaiting_contract', 'system', ''
        FROM orders o
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_events_order_id"), table_name="order_events")
    op.drop_table("order_events")

    op.drop_constraint(op.f("fk_files_order_id_orders"), "files", type_="foreignkey")
    op.drop_index(op.f("ix_files_order_id"), table_name="files")
    op.drop_column("files", "order_id")
    # بازگشت مخرب است: اسناد سفارش با قید قدیمی سازگار نیستند
    op.execute("DELETE FROM files WHERE purpose = 'order_document'")
    op.drop_constraint(op.f("ck_files_purpose_valid"), "files", type_="check")
    op.create_check_constraint(op.f("ck_files_purpose_valid"), "files", OLD_PURPOSES)

    op.drop_index(op.f("ix_orders_supplier_organization_id"), table_name="orders")
    op.drop_index(op.f("ix_orders_buyer_organization_id"), table_name="orders")
    op.drop_table("orders")
