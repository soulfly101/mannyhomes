"""Repair and issue reports from tenants (#17), managed by admins (#21)

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# To the microsecond, so two reports sent in the same second still list in the order they came.
PRECISE = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tickets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("tenancy_id", sa.String(36), sa.ForeignKey("tenancies.id"), nullable=False),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("room_number", sa.String(20), nullable=False),
        sa.Column("building_name", sa.String(100), nullable=False),
        sa.Column("created_at", PRECISE, nullable=False, index=True),
        sa.Column("updated_at", PRECISE, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tickets")
