"""event branding, flyer upload and RSVP auto-close

Adds invite presentation fields (headline, message, theme preset, accent
colour, background preset), an uploaded-flyer storage path, and an
``auto_close_rsvp`` toggle to the events table.

Revision ID: 0002_event_branding
Revises: 0001_initial
Create Date: 2026-07-02 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_event_branding"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "invite_headline",
                sa.String(length=200),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column(
                "invite_message", sa.Text(), nullable=False, server_default=""
            )
        )
        batch_op.add_column(
            sa.Column(
                "flyer_storage_path",
                sa.String(length=600),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column(
                "auto_close_rsvp",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            )
        )
        batch_op.add_column(
            sa.Column(
                "theme_preset",
                sa.String(length=30),
                nullable=False,
                server_default="elegant",
            )
        )
        batch_op.add_column(
            sa.Column(
                "accent_color",
                sa.String(length=20),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column(
                "background_preset",
                sa.String(length=30),
                nullable=False,
                server_default="",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.drop_column("background_preset")
        batch_op.drop_column("accent_color")
        batch_op.drop_column("theme_preset")
        batch_op.drop_column("auto_close_rsvp")
        batch_op.drop_column("flyer_storage_path")
        batch_op.drop_column("invite_message")
        batch_op.drop_column("invite_headline")
