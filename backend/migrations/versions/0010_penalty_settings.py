"""The admin's choice of penalties for overdue sanitation bills (#25)

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "penalty_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("enabled_on", sa.Date, nullable=True),
        sa.Column("late_fee", sa.Integer, nullable=False, server_default="0"),
        sa.Column("freeze_tickets", sa.Boolean, nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table("penalty_settings")
