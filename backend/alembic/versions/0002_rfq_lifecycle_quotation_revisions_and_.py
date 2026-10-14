"""rfq lifecycle, quotation revisions and agreement acceptances — گام 2a فاز ۲

- rfqs: مهلت دریافت پیشنهاد (`quotes_due`، همیشه ≤ مهلت تحویل)، اطلاعات لغو و متن جستجوی یکسان‌شده
- quotations: وضعیت (فعال / پس‌گرفته)، زمان پس‌گرفتن و شماره‌ی نسخه
- agreement_acceptances: شاهد پذیرش هر نسخه از قوانین و NDA

داده‌های موجود حفظ می‌شوند: `quotes_due` ردیف‌های قبلی برابر مهلت قبلی قرار می‌گیرد (همان رفتار فاز ۱).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14 10:50:23.370957
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RFQ_SEARCH_TEXT = (
    "translate(lower(title || ' ' || description || ' ' || material), "
    "'يىك' || chr(8204), 'ییک ')"
)


def upgrade() -> None:
    op.create_table(
        "agreement_acceptances",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("document", sa.String(length=40), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("rfq_id", sa.Uuid(), nullable=True),
        sa.Column(
            "accepted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_agreement_acceptances_organization_id_organizations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["rfq_id"],
            ["rfqs.id"],
            name=op.f("fk_agreement_acceptances_rfq_id_rfqs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_agreement_acceptances_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agreement_acceptances")),
    )
    op.create_index(
        "ix_agreement_acceptances_org_document",
        "agreement_acceptances",
        ["organization_id", "document"],
    )
    op.create_index("ix_agreement_acceptances_user", "agreement_acceptances", ["user_id"])
    op.create_index(
        "uq_agreement_acceptances_rfq_nda",
        "agreement_acceptances",
        ["organization_id", "rfq_id"],
        unique=True,
        postgresql_where=sa.text("document = 'rfq_nda'"),
    )

    op.add_column(
        "quotations",
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
    )
    op.add_column("quotations", sa.Column("withdrawn_at", sa.DateTime(timezone=True)))
    op.add_column(
        "quotations", sa.Column("revision", sa.Integer(), server_default="1", nullable=False)
    )
    op.create_check_constraint(
        op.f("ck_quotations_status_valid"), "quotations", "status IN ('active', 'withdrawn')"
    )
    op.create_check_constraint(
        op.f("ck_quotations_withdrawn_consistent"),
        "quotations",
        "(status = 'withdrawn') = (withdrawn_at IS NOT NULL)",
    )
    op.create_check_constraint(
        op.f("ck_quotations_revision_positive"), "quotations", "revision >= 1"
    )

    # مهلت دریافت پیشنهاد: ابتدا nullable، پر کردن ردیف‌های موجود، سپس NOT NULL
    op.add_column("rfqs", sa.Column("quotes_due", sa.Date(), nullable=True))
    op.execute("UPDATE rfqs SET quotes_due = deadline")
    op.alter_column("rfqs", "quotes_due", nullable=False)
    op.add_column("rfqs", sa.Column("cancelled_at", sa.DateTime(timezone=True)))
    op.add_column("rfqs", sa.Column("cancel_reason", sa.String(length=500)))
    op.add_column(
        "rfqs",
        sa.Column(
            "search_text", sa.Text(), sa.Computed(RFQ_SEARCH_TEXT, persisted=True), nullable=False
        ),
    )
    op.create_check_constraint(
        op.f("ck_rfqs_quotes_due_before_deadline"), "rfqs", "quotes_due <= deadline"
    )
    op.create_check_constraint(
        op.f("ck_rfqs_cancelled_consistent"),
        "rfqs",
        "(status = 'cancelled') = (cancelled_at IS NOT NULL)",
    )
    op.create_index("ix_rfqs_open_feed", "rfqs", ["status", "quotes_due"])


def downgrade() -> None:
    op.drop_index("ix_rfqs_open_feed", table_name="rfqs")
    op.drop_constraint(op.f("ck_rfqs_cancelled_consistent"), "rfqs", type_="check")
    op.drop_constraint(op.f("ck_rfqs_quotes_due_before_deadline"), "rfqs", type_="check")
    op.drop_column("rfqs", "search_text")
    op.drop_column("rfqs", "cancel_reason")
    op.drop_column("rfqs", "cancelled_at")
    op.drop_column("rfqs", "quotes_due")

    op.drop_constraint(op.f("ck_quotations_revision_positive"), "quotations", type_="check")
    op.drop_constraint(op.f("ck_quotations_withdrawn_consistent"), "quotations", type_="check")
    op.drop_constraint(op.f("ck_quotations_status_valid"), "quotations", type_="check")
    op.drop_column("quotations", "revision")
    op.drop_column("quotations", "withdrawn_at")
    op.drop_column("quotations", "status")

    op.drop_index("uq_agreement_acceptances_rfq_nda", table_name="agreement_acceptances")
    op.drop_index("ix_agreement_acceptances_user", table_name="agreement_acceptances")
    op.drop_index("ix_agreement_acceptances_org_document", table_name="agreement_acceptances")
    op.drop_table("agreement_acceptances")
