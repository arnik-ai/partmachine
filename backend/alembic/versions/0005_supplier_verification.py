"""supplier verification — گام 2e فاز ۲

جدول verification_requests (مدارک قطعه‌ساز + تصمیم ادمین)، ستون suppliers.verified_at و
پیوند مدارک: files.verification_request_id. هیچ داده‌ی موجودی تغییر نمی‌کند.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-14 15:20:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('verification_requests',
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('submitted_by_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
    sa.Column('note', sa.Text(), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decided_by_id', sa.Uuid(), nullable=True),
    sa.Column('decision_reason', sa.Text(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_by_id', sa.Uuid(), nullable=True),
    sa.Column('revoke_reason', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("(status = 'pending') = (decided_at IS NULL)", name=op.f('ck_verification_requests_decision_consistent')),
    sa.CheckConstraint("(status = 'revoked') = (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)", name=op.f('ck_verification_requests_revocation_consistent')),
    sa.CheckConstraint("status <> 'rejected' OR decision_reason IS NOT NULL", name=op.f('ck_verification_requests_rejection_has_reason')),
    sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'revoked')", name=op.f('ck_verification_requests_status_valid')),
    sa.ForeignKeyConstraint(['decided_by_id'], ['users.id'], name=op.f('fk_verification_requests_decided_by_id_users'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_verification_requests_organization_id_organizations'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['revoked_by_id'], ['users.id'], name=op.f('fk_verification_requests_revoked_by_id_users'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['submitted_by_id'], ['users.id'], name=op.f('fk_verification_requests_submitted_by_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_verification_requests'))
    )
    op.create_index(op.f('ix_verification_requests_organization_id'), 'verification_requests', ['organization_id'], unique=False)
    # هر سازمان حداکثر یک درخواست «در انتظار» (حتی با ارسال هم‌زمان)
    op.create_index(
        'uq_verification_requests_pending_org',
        'verification_requests',
        ['organization_id'],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.add_column('files', sa.Column('verification_request_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_files_verification_request_id'), 'files', ['verification_request_id'], unique=False)
    op.create_foreign_key(op.f('fk_files_verification_request_id_verification_requests'), 'files', 'verification_requests', ['verification_request_id'], ['id'], ondelete='RESTRICT')

    op.add_column('suppliers', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('suppliers', 'verified_at')

    op.drop_constraint(op.f('fk_files_verification_request_id_verification_requests'), 'files', type_='foreignkey')
    op.drop_index(op.f('ix_files_verification_request_id'), table_name='files')
    op.drop_column('files', 'verification_request_id')

    op.drop_index('uq_verification_requests_pending_org', table_name='verification_requests')
    op.drop_index(op.f('ix_verification_requests_organization_id'), table_name='verification_requests')
    op.drop_table('verification_requests')
