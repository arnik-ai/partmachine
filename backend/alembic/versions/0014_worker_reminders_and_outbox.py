"""background worker: delivery reminders and message outbox — گام 4d فاز ۴

- order_reminders: هر یادآوری موعد تحویل (نزدیک موعد، گذشته از موعد) برای هر سفارش یک بار.
- outbox_messages: صف ارسال ایمیل و پیامک اعلان‌ها؛ تا انتخاب سرویس (S9) در تولید خالی می‌ماند.
- ایندکس جزئی اعلان‌های خوانده‌شده برای پاک‌سازی روزانه‌ی اعلان‌های قدیمی.

فقط افزودنی است.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-15 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "order_reminders",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('due_soon', 'overdue')", name=op.f("ck_order_reminders_kind_valid")
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_reminders_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("order_id", "kind", name=op.f("pk_order_reminders")),
    )

    op.create_table(
        "outbox_messages",
        sa.Column("notification_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_error", sa.String(length=300), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("attempts >= 0", name=op.f("ck_outbox_messages_attempts_non_negative")),
        sa.CheckConstraint(
            "channel IN ('email', 'sms')", name=op.f("ck_outbox_messages_channel_valid")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'sent', 'failed', 'skipped')",
            name=op.f("ck_outbox_messages_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name=op.f("fk_outbox_messages_notification_id_notifications"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outbox_messages")),
    )
    op.create_index(
        op.f("ix_outbox_messages_notification_id"),
        "outbox_messages",
        ["notification_id"],
        unique=False,
    )
    op.create_index(
        "ix_outbox_messages_due",
        "outbox_messages",
        ["next_attempt_at"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_index(
        "ix_notifications_read_created",
        "notifications",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("read_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_read_created", table_name="notifications")
    op.drop_index("ix_outbox_messages_due", table_name="outbox_messages")
    op.drop_index(op.f("ix_outbox_messages_notification_id"), table_name="outbox_messages")
    op.drop_table("outbox_messages")
    op.drop_table("order_reminders")
