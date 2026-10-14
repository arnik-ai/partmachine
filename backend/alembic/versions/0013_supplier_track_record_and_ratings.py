"""supplier track record and order ratings — گام 3f فاز ۳

- suppliers: شمارش‌های سابقه‌ی واقعی (تحویل‌شده، به‌موقع، بازرسی‌شده، قبولی نوبت اول، امتیازها،
  پیشنهادها) برای امتیاز اعتماد و توضیح صادقانه‌ی آن (O12). همه با پیش‌فرض ۰.
- order_ratings: امتیاز ۱ تا ۵ کارفرما پس از تکمیل سفارش؛ برای هر سفارش یکی.

فقط افزودنی است: مقدارهای فعلی قطعه‌سازها دست نمی‌خورد و از نخستین رویداد واقعی هر قطعه‌ساز
(تکمیل سفارش، بازرسی، امتیاز یا پیشنهاد) از داده‌ی واقعی دوباره ساخته می‌شود.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COUNTS = (
    "delivered_jobs",
    "on_time_jobs",
    "inspected_jobs",
    "first_pass_jobs",
    "rating_count",
    "rating_total",
    "responses_count",
)
CHECKS = {
    "delivery_record_valid": (
        "delivered_jobs >= 0 AND on_time_jobs >= 0 AND on_time_jobs <= delivered_jobs"
    ),
    "inspection_record_valid": (
        "inspected_jobs >= 0 AND first_pass_jobs >= 0 AND first_pass_jobs <= inspected_jobs"
    ),
    "rating_record_valid": (
        "rating_count >= 0 AND rating_total BETWEEN rating_count AND rating_count * 5"
    ),
    "responses_non_negative": "responses_count >= 0",
}


def upgrade() -> None:
    for column in COUNTS:
        op.add_column(
            "suppliers", sa.Column(column, sa.Integer(), server_default="0", nullable=False)
        )
    for name, condition in CHECKS.items():
        op.create_check_constraint(op.f(f"ck_suppliers_{name}"), "suppliers", condition)

    op.create_table(
        "order_ratings",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("rated_by_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(length=500), server_default="", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name=op.f("ck_order_ratings_score_range")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_ratings_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["rated_by_id"],
            ["users.id"],
            name=op.f("fk_order_ratings_rated_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_order_ratings_supplier_id_suppliers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_ratings")),
        sa.UniqueConstraint("order_id", name=op.f("uq_order_ratings_order_id")),
    )
    op.create_index(
        op.f("ix_order_ratings_supplier_id"), "order_ratings", ["supplier_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_ratings_supplier_id"), table_name="order_ratings")
    op.drop_table("order_ratings")
    for name in CHECKS:
        op.drop_constraint(op.f(f"ck_suppliers_{name}"), "suppliers", type_="check")
    for column in reversed(COUNTS):
        op.drop_column("suppliers", column)
