"""Buildings and their room types (inventory and prices)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "buildings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("location", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sanitation_fee", sa.Integer, nullable=False),
        sa.Column("listed", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "room_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "building_id", sa.String(36), sa.ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("rent", sa.Integer, nullable=False),
        sa.Column("quantity_available", sa.Integer, nullable=False),
        sa.Column("sanitation_fee_override", sa.Integer, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("building_id", "name", name="uq_room_types_building_name"),
    )
    op.create_index("ix_room_types_building_id", "room_types", ["building_id"])


def downgrade() -> None:
    op.drop_table("room_types")
    op.drop_table("buildings")
