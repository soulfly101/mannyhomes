"""Nightly database backups (#30): one row per run, written by deploy/backup/backup.sh

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "backup_runs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("finished_at", sa.DateTime, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("file", sa.String(120), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("error", sa.String(200), nullable=True),
    )
    op.create_index("ix_backup_runs_finished_at", "backup_runs", ["finished_at"])


def downgrade() -> None:
    op.drop_table("backup_runs")
