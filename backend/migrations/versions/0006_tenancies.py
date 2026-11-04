"""Tenancies (#18)

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenancies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("booking_id", sa.String(36), sa.ForeignKey("bookings.id"), nullable=False, unique=True),
        sa.Column(
            "room_type_id", sa.String(36), sa.ForeignKey("room_types.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "building_id", sa.String(36), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("room_name", sa.String(60), nullable=False),
        sa.Column("building_name", sa.String(100), nullable=False),
        sa.Column("location", sa.String(100), nullable=False),
        sa.Column("room_number", sa.String(20), nullable=False),
        sa.Column("rent", sa.Integer, nullable=False),
        sa.Column("sanitation_fee", sa.Integer, nullable=False),
        sa.Column("renting_bill_id", sa.Integer, sa.ForeignKey("bills.id"), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("ended_at", sa.DateTime, nullable=True),
        sa.Column(
            "allocated_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"])
    op.create_index("ix_tenancies_building_id", "tenancies", ["building_id"])


def downgrade() -> None:
    op.drop_table("tenancies")
