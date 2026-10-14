"""account security — گام 2f فاز ۲

users.token_version (باطل کردن فوری توکن‌های دسترسی پس از تغییر یا بازیابی رمز)، و موبایل
تأییدشده (users.phone یکتا، users.phone_verified_at). فقط افزودنی؛ داده‌ی موجود تغییر نمی‌کند.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-14 17:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('phone_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        op.f('ck_users_phone_consistent'), 'users', 'phone_verified_at IS NULL OR phone IS NOT NULL'
    )
    op.create_index(
        'uq_users_phone',
        'users',
        ['phone'],
        unique=True,
        postgresql_where=sa.text('phone IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_users_phone', table_name='users')
    op.drop_constraint(op.f('ck_users_phone_consistent'), 'users', type_='check')
    op.drop_column('users', 'phone_verified_at')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'token_version')
