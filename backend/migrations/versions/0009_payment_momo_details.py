"""What a Mobile Money payment needs to carry on after an SMS code: its number, network and state (Moolre)

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("momo_phone", sa.String(16), nullable=True))
    op.add_column("payments", sa.Column("momo_network", sa.String(8), nullable=True))
    op.add_column(
        "payments", sa.Column("otp_required", sa.Boolean, nullable=False, server_default=sa.false())
    )
    op.add_column("payments", sa.Column("prompted_at", sa.DateTime, nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "prompted_at")
    op.drop_column("payments", "otp_required")
    op.drop_column("payments", "momo_network")
    op.drop_column("payments", "momo_phone")
