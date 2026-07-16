"""admin notifications

Adds the admin_notifications table — an in-app operational notification centre
for admins (Phase 7 observability). event_id / entity_id are intentionally NOT
foreign keys, so a notification survives the deletion or archival of the entity
it describes.

Revision ID: 0006_admin_notifications
Revises: 0005_guest_comms
Create Date: 2026-07-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0006_admin_notifications"
down_revision: Union[str, None] = "0005_guest_comms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_notifications",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=32), nullable=True),
        sa.Column("notification_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.String(length=32), nullable=True),
        sa.Column("action_url", sa.String(length=600), nullable=True),
        sa.Column("dedupe_key", sa.String(length=200), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("metadata", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_notifications_event_id"), "admin_notifications", ["event_id"]
    )
    op.create_index(
        op.f("ix_admin_notifications_severity"), "admin_notifications", ["severity"]
    )
    op.create_index(
        op.f("ix_admin_notifications_dedupe_key"), "admin_notifications", ["dedupe_key"]
    )
    op.create_index(
        op.f("ix_admin_notifications_is_read"), "admin_notifications", ["is_read"]
    )
    op.create_index(
        op.f("ix_admin_notifications_created_at"), "admin_notifications", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_admin_notifications_created_at"), table_name="admin_notifications"
    )
    op.drop_index(
        op.f("ix_admin_notifications_is_read"), table_name="admin_notifications"
    )
    op.drop_index(
        op.f("ix_admin_notifications_dedupe_key"), table_name="admin_notifications"
    )
    op.drop_index(
        op.f("ix_admin_notifications_severity"), table_name="admin_notifications"
    )
    op.drop_index(
        op.f("ix_admin_notifications_event_id"), table_name="admin_notifications"
    )
    op.drop_table("admin_notifications")
