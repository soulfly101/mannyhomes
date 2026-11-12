"""Texts (#27): queued SMS messages and the admin's broadcasts

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRECISE = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "sms_broadcasts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("template", sa.String(400), nullable=False),
        sa.Column(
            "building_id", sa.String(36), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("audience", sa.String(120), nullable=False),
        sa.Column("sent_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", PRECISE, nullable=False),
    )
    op.create_table(
        "sms_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("phone", sa.String(16), nullable=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("body", sa.String(400), nullable=False),
        sa.Column("dedupe_key", sa.String(80), nullable=True, unique=True),
        sa.Column(
            "broadcast_id", sa.String(36), sa.ForeignKey("sms_broadcasts.id"), nullable=True, index=True
        ),
        sa.Column("status", sa.String(24), nullable=False, index=True),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error", sa.String(200), nullable=True),
        sa.Column("created_at", PRECISE, nullable=False, index=True),
        sa.Column("sent_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("sms_messages")
    op.drop_table("sms_broadcasts")
