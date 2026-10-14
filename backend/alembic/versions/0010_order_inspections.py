"""order inspections — گام 3d فاز ۳

بازرسی کیفیت اختیاری هر سفارش (order_inspections): آزمایشگاه تأییدشده‌ای که کارفرما انتخاب
کرده، دور فعلی بازرسی و آخرین نتیجه. به‌علاوه‌ی ایندکس یکتای جزئی برای «تعهد عدم افشای
آزمایشگاه» (inspection_nda) در agreement_acceptances. فقط افزودنی است.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-15 03:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "order_inspections",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("lab_organization_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="requested", nullable=False),
        sa.Column("attempt", sa.Integer(), server_default="0", nullable=False),
        sa.Column("requested_by_id", sa.Uuid(), nullable=False),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_by_id", sa.Uuid(), nullable=True),
        sa.Column("result_note", sa.Text(), server_default="", nullable=False),
        sa.Column("report_file_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "status IN ('requested', 'ready', 'passed', 'failed')",
            name=op.f("ck_order_inspections_status_valid"),
        ),
        sa.CheckConstraint(
            "attempt >= 0", name=op.f("ck_order_inspections_attempt_non_negative")
        ),
        sa.CheckConstraint(
            "(status = 'requested') = (attempt = 0)",
            name=op.f("ck_order_inspections_attempt_consistent"),
        ),
        sa.CheckConstraint(
            "(status = 'requested') = (ready_at IS NULL)",
            name=op.f("ck_order_inspections_ready_consistent"),
        ),
        sa.CheckConstraint(
            "status NOT IN ('passed', 'failed') "
            "OR (result_at IS NOT NULL AND report_file_id IS NOT NULL)",
            name=op.f("ck_order_inspections_result_recorded"),
        ),
        sa.ForeignKeyConstraint(
            ["lab_organization_id"],
            ["organizations.id"],
            name=op.f("fk_order_inspections_lab_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_inspections_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["report_file_id"],
            ["files.id"],
            name=op.f("fk_order_inspections_report_file_id_files"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"],
            ["users.id"],
            name=op.f("fk_order_inspections_requested_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["result_by_id"],
            ["users.id"],
            name=op.f("fk_order_inspections_result_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_inspections")),
        sa.UniqueConstraint("order_id", name=op.f("uq_order_inspections_order_id")),
    )
    op.create_index(
        op.f("ix_order_inspections_lab_organization_id"),
        "order_inspections",
        ["lab_organization_id"],
        unique=False,
    )
    op.create_index(
        "uq_agreement_acceptances_inspection_nda",
        "agreement_acceptances",
        ["organization_id", "rfq_id"],
        unique=True,
        postgresql_where=sa.text("document = 'inspection_nda'"),
    )


def downgrade() -> None:
    op.drop_index("uq_agreement_acceptances_inspection_nda", table_name="agreement_acceptances")
    op.drop_index(
        op.f("ix_order_inspections_lab_organization_id"), table_name="order_inspections"
    )
    op.drop_table("order_inspections")
