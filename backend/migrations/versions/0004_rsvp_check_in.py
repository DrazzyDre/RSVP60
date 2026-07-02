"""rsvp event-day check-in

Adds check-in fields to the rsvps table: checked_in_at, checked_in_by_admin_id,
checked_in_seats and a unique per-RSVP check_in_token. Existing rows are
backfilled with a random token.

Revision ID: 0004_rsvp_check_in
Revises: 0003_admin_roles
Create Date: 2026-07-02 14:00:00.000000

"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004_rsvp_check_in"
down_revision: Union[str, None] = "0003_admin_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("rsvps", schema=None) as batch_op:
        batch_op.add_column(sa.Column("checked_in_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("checked_in_by_admin_id", sa.String(length=32), nullable=True)
        )
        batch_op.add_column(sa.Column("checked_in_seats", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("check_in_token", sa.String(length=64), nullable=True)
        )

    # Backfill a unique token for every existing RSVP.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id FROM rsvps WHERE check_in_token IS NULL")
    ).fetchall()
    for (rid,) in rows:
        conn.execute(
            sa.text("UPDATE rsvps SET check_in_token = :t WHERE id = :i"),
            {"t": secrets.token_urlsafe(24), "i": rid},
        )

    with op.batch_alter_table("rsvps", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_rsvps_check_in_token"), ["check_in_token"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("rsvps", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_rsvps_check_in_token"))
        batch_op.drop_column("check_in_token")
        batch_op.drop_column("checked_in_seats")
        batch_op.drop_column("checked_in_by_admin_id")
        batch_op.drop_column("checked_in_at")
