"""guest communications

Adds email consent + delivery-timestamp fields to rsvps, host-alert settings to
events, and a communication_logs table recording each email delivery attempt.

Revision ID: 0005_guest_comms
Revises: 0004_rsvp_check_in
Create Date: 2026-07-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0005_guest_comms"
down_revision: Union[str, None] = "0004_rsvp_check_in"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- rsvps: email consent + per-email delivery timestamps ---------------
    with op.batch_alter_table("rsvps", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "email_opt_in",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(sa.Column("confirmation_sent_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("reminder_sent_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("status_email_sent_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("check_in_email_sent_at", sa.DateTime(), nullable=True))

    # --- events: host alert configuration -----------------------------------
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "host_notification_email",
                sa.String(length=255),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column(
                "notify_tree_exhausted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
        batch_op.add_column(
            sa.Column(
                "notify_waitlisted_rsvp",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    # --- communication_logs table -------------------------------------------
    op.create_table(
        "communication_logs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=32), nullable=False),
        sa.Column("rsvp_id", sa.String(length=32), nullable=True),
        sa.Column("invite_tree_id", sa.String(length=32), nullable=True),
        sa.Column("communication_type", sa.String(length=50), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=True),
        sa.Column("recipient", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error_summary", sa.String(length=500), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("metadata", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_communication_logs_event_id"), "communication_logs", ["event_id"]
    )
    op.create_index(
        op.f("ix_communication_logs_rsvp_id"), "communication_logs", ["rsvp_id"]
    )
    op.create_index(
        op.f("ix_communication_logs_status"), "communication_logs", ["status"]
    )
    op.create_index(
        op.f("ix_communication_logs_created_at"), "communication_logs", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_communication_logs_created_at"), table_name="communication_logs")
    op.drop_index(op.f("ix_communication_logs_status"), table_name="communication_logs")
    op.drop_index(op.f("ix_communication_logs_rsvp_id"), table_name="communication_logs")
    op.drop_index(op.f("ix_communication_logs_event_id"), table_name="communication_logs")
    op.drop_table("communication_logs")

    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.drop_column("notify_waitlisted_rsvp")
        batch_op.drop_column("notify_tree_exhausted")
        batch_op.drop_column("host_notification_email")

    with op.batch_alter_table("rsvps", schema=None) as batch_op:
        batch_op.drop_column("check_in_email_sent_at")
        batch_op.drop_column("status_email_sent_at")
        batch_op.drop_column("reminder_sent_at")
        batch_op.drop_column("confirmation_sent_at")
        batch_op.drop_column("email_opt_in")
