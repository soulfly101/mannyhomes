"""Photos the admin uploads for buildings and room types

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.mysql import MEDIUMBLOB

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "building_id", sa.String(36), sa.ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "room_type_id", sa.String(36), sa.ForeignKey("room_types.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("width", sa.Integer, nullable=False),
        sa.Column("height", sa.Integer, nullable=False),
        sa.Column("large", MEDIUMBLOB, nullable=False),
        sa.Column("thumb", MEDIUMBLOB, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_photos_building_id", "photos", ["building_id"])
    op.create_index("ix_photos_room_type_id", "photos", ["room_type_id"])


def downgrade() -> None:
    op.drop_table("photos")
