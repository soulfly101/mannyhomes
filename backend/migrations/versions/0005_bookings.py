"""Bookings (#14)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "room_type_id", sa.String(36), sa.ForeignKey("room_types.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("room_name", sa.String(60), nullable=False),
        sa.Column("building_name", sa.String(100), nullable=False),
        sa.Column("location", sa.String(100), nullable=False),
        sa.Column("bill_id", sa.Integer, sa.ForeignKey("bills.id"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("hold_until", sa.DateTime, nullable=True),
        sa.Column("paid_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_bookings_tenant_id", "bookings", ["tenant_id"])
    op.create_index("ix_bookings_room_type_id", "bookings", ["room_type_id"])
    op.create_index("ix_bookings_created_at", "bookings", ["created_at"])


def downgrade() -> None:
    op.drop_table("bookings")
