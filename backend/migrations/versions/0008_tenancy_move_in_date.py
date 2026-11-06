"""The date a tenant moves in, set by the admin, which sets their sanitation bills (#16)

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenancies", sa.Column("move_in_date", sa.Date, nullable=True))


def downgrade() -> None:
    op.drop_column("tenancies", "move_in_date")
