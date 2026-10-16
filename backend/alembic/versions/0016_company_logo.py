"""company profile photo: the logo file purpose

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-16 15:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_PURPOSES = (
    "purpose IN ('rfq_attachment', 'verification_document', 'portfolio_image', 'order_document')"
)
NEW_PURPOSES = (
    "purpose IN ('rfq_attachment', 'verification_document', 'portfolio_image', 'order_document', "
    "'logo')"
)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_files_purpose_valid"), "files", type_="check")
    op.create_check_constraint(op.f("ck_files_purpose_valid"), "files", NEW_PURPOSES)


def downgrade() -> None:
    # نسخه‌ی قبلی عکس پروفایل ندارد؛ ردیف این عکس‌ها حذف می‌شود
    op.execute("DELETE FROM files WHERE purpose = 'logo'")
    op.drop_constraint(op.f("ck_files_purpose_valid"), "files", type_="check")
    op.create_check_constraint(op.f("ck_files_purpose_valid"), "files", OLD_PURPOSES)
