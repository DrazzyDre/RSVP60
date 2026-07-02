"""SQLAlchemy ORM models for RSVP60.

String UUID primary keys keep the schema portable between SQLite (local dev)
and PostgreSQL/Supabase (production) without dialect-specific column types.
"""

import secrets
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_uuid() -> str:
    return uuid.uuid4().hex


def new_token() -> str:
    """Secure, URL-safe, hard-to-guess public invite token."""
    return secrets.token_urlsafe(24)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # birthday | wedding | funeral | memorial | anniversary | church | dinner |
    # conference | other  — drives copy on the public invite page.
    event_type: Mapped[str] = mapped_column(String(50), default="other")
    host_or_celebrant_name: Mapped[str] = mapped_column(String(200), default="")
    title: Mapped[str] = mapped_column(String(200), default="")
    # Optional short banner line + longer message shown on the public invite.
    # When blank the invite falls back to title / description respectively.
    invite_headline: Mapped[str] = mapped_column(String(200), default="")
    invite_message: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    event_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Optional human-friendly time override, e.g. "5:00 PM (prompt)".
    event_time: Mapped[str] = mapped_column(String(100), default="")
    venue_name: Mapped[str] = mapped_column(String(200), default="")
    venue_address: Mapped[str] = mapped_column(String(400), default="")
    maps_url: Mapped[str] = mapped_column(String(600), default="")
    dress_code: Mapped[str] = mapped_column(Text, default="")
    gift_details: Mapped[str] = mapped_column(Text, default="")
    contact_phone: Mapped[str] = mapped_column(String(50), default="")
    # External flyer URL (optional). `flyer_storage_path` is set when an image
    # is uploaded through the app; it takes precedence over `flyer_url`.
    flyer_url: Mapped[str] = mapped_column(String(600), default="")
    flyer_storage_path: Mapped[str] = mapped_column(String(600), default="")
    rsvp_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When True, the public RSVP form closes automatically once the deadline
    # passes. When False, the deadline is shown but RSVPs stay open.
    auto_close_rsvp: Mapped[bool] = mapped_column(Boolean, default=True)
    # Invite presentation. theme_preset drives the public page palette; the
    # optional accent_color / background_preset fine-tune it.
    theme_preset: Mapped[str] = mapped_column(String(30), default="elegant")
    accent_color: Mapped[str] = mapped_column(String(20), default="")
    background_preset: Mapped[str] = mapped_column(String(30), default="")
    # draft | active | closed | archived
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    invite_trees: Mapped[list["InviteTree"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    rsvps: Mapped[list["Rsvp"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    # owner | admin | viewer  (see app.roles)
    role: Mapped[str] = mapped_column(String(50), default="admin")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # Deactivated admins cannot log in and existing tokens stop working.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class InviteTree(Base):
    __tablename__ = "invite_trees"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, default=new_token, nullable=False
    )
    allocated_seats: Mapped[int] = mapped_column(Integer, default=0)
    # 0 = no plus-one (max 1 seat), 1 = +1 (max 2), 2 = +2 (max 3)
    max_extra_guests: Mapped[int] = mapped_column(Integer, default=0)
    # Stored lifecycle status: "active" or "paused".
    # "exhausted" is derived at read time from seat usage.
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    event: Mapped["Event"] = relationship(back_populates="invite_trees")
    rsvps: Mapped[list["Rsvp"]] = relationship(back_populates="invite_tree")


class Rsvp(Base):
    __tablename__ = "rsvps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), nullable=False)
    invite_tree_id: Mapped[str] = mapped_column(
        ForeignKey("invite_trees.id"), nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "attending" or "declined"
    attendance_status: Mapped[str] = mapped_column(String(20), default="attending")
    # "accepted", "declined", "waitlisted", "cancelled"
    rsvp_status: Mapped[str] = mapped_column(String(20), default="accepted")
    seats_requested: Mapped[int] = mapped_column(Integer, default=1)
    note_to_celebrant: Mapped[str | None] = mapped_column(Text, nullable=True)
    dietary_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    event: Mapped["Event"] = relationship(back_populates="rsvps")
    invite_tree: Mapped["InviteTree"] = relationship(back_populates="rsvps")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    admin_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), default="")
    entity_id: Mapped[str] = mapped_column(String(32), default="")
    meta: Mapped[str] = mapped_column("metadata", Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
