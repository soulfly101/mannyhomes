"""Tenancy agreements and admin signatures (#24)

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.mysql import MEDIUMTEXT

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("signature_image", MEDIUMTEXT, nullable=True))
    op.create_table(
        "agreements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenancy_id", sa.String(36), sa.ForeignKey("tenancies.id"), nullable=False, unique=True),
        sa.Column("lease_start", sa.Date, nullable=False),
        sa.Column("lease_end", sa.Date, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("draft_wording", sa.Boolean, nullable=False),
        sa.Column("landlord_name", sa.String(120), nullable=False),
        sa.Column("landlord_signature", MEDIUMTEXT, nullable=False),
        sa.Column("tenant_signature_kind", sa.String(8), nullable=True),
        sa.Column("tenant_signature_image", MEDIUMTEXT, nullable=True),
        sa.Column("tenant_typed_name", sa.String(120), nullable=True),
        sa.Column("signed_at", sa.DateTime, nullable=True),
        sa.Column("signed_ip", sa.String(45), nullable=True),
        sa.Column("signed_user_agent", sa.String(255), nullable=True),
        sa.Column("document_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_agreements_created_at", "agreements", ["created_at"])


def downgrade() -> None:
    op.drop_table("agreements")
    op.drop_column("users", "signature_image")
