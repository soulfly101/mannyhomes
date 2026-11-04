"""Deposits on room types; bills and payments (#19)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing room types get 0 ("not set yet") until the admin fills them in.
    op.add_column("room_types", sa.Column("booking_deposit", sa.Integer, nullable=False, server_default="0"))
    op.add_column("room_types", sa.Column("renting_deposit", sa.Integer, nullable=False, server_default="0"))

    op.create_table(
        "bills",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("period", sa.String(7), nullable=True),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column(
            "room_type_id", sa.String(36), sa.ForeignKey("room_types.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("voided_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("tenant_id", "kind", "period", name="uq_bills_tenant_kind_period"),
    )
    op.create_index("ix_bills_tenant_id", "bills", ["tenant_id"])
    op.create_index("ix_bills_created_at", "bills", ["created_at"])

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("bill_id", sa.Integer, sa.ForeignKey("bills.id"), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("reference", sa.String(100), nullable=False, unique=True),
        sa.Column("paid_at", sa.DateTime, nullable=True),
        sa.Column(
            "recorded_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_payments_bill_id", "payments", ["bill_id"])


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("bills")
    op.drop_column("room_types", "renting_deposit")
    op.drop_column("room_types", "booking_deposit")
