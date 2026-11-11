"""Chat between admins and tenants (#22): one conversation per tenant per topic, and its messages

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRECISE = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("tickets.id"), nullable=True),
        sa.Column("topic", sa.String(60), nullable=False),
        sa.Column("tenant_read_id", sa.Integer, nullable=False, server_default="0"),
        sa.Column("admin_read_id", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", PRECISE, nullable=False),
        sa.Column("last_message_at", PRECISE, nullable=True, index=True),
        sa.UniqueConstraint("tenant_id", "topic", name="uq_conversations_tenant_topic"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("sender_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_admin", sa.Boolean, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", PRECISE, nullable=False),
        sa.Index("ix_messages_conversation_id_id", "conversation_id", "id"),
    )


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversations")
