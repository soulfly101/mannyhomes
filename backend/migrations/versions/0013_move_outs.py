"""Move-outs (#26): deposits held, deductions and the refund

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "move_outs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenancy_id", sa.String(36), sa.ForeignKey("tenancies.id"), nullable=False, unique=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("moved_out_on", sa.Date, nullable=False),
        sa.Column("deposits_held", sa.Integer, nullable=False),
        sa.Column("deductions_total", sa.Integer, nullable=False),
        sa.Column("refund_due", sa.Integer, nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("refunded_at", sa.DateTime, nullable=True),
        sa.Column("refund_method", sa.String(24), nullable=True),
        sa.Column("refund_reference", sa.String(100), nullable=True),
        sa.Column(
            "created_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "move_out_deductions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("move_out_id", sa.String(36), sa.ForeignKey("move_outs.id"), nullable=False, index=True),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("bill_id", sa.Integer, sa.ForeignKey("bills.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("move_out_deductions")
    op.drop_table("move_outs")
