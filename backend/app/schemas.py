"""Pydantic request/response schemas."""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .roles import ROLES
from .security import validate_password_strength


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminOut


# --------------------------------------------------------------------------- #
# Admin management (owner only)
# --------------------------------------------------------------------------- #
class AdminCreate(BaseModel):
    email: EmailStr
    full_name: str = Field("", max_length=200)
    role: str = Field(...)
    password: str = Field(..., max_length=200)

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v

    @field_validator("password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class AdminUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=200)
    role: str | None = None

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v):
        if v is not None and v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v


class AdminPasswordSet(BaseModel):
    """Owner sets/resets another admin's password."""
    password: str = Field(..., max_length=200)

    @field_validator("password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class AdminSelfPasswordUpdate(BaseModel):
    """A logged-in admin changes their own password."""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., max_length=200)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


# --------------------------------------------------------------------------- #
# Audit log (owner only)
# --------------------------------------------------------------------------- #
class AuditLogOut(BaseModel):
    id: str
    created_at: datetime
    admin_id: str | None = None
    admin_email: str | None = None
    admin_name: str | None = None
    action: str
    entity_type: str
    entity_id: str
    meta: dict = {}


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int


# --------------------------------------------------------------------------- #
# Public invite
# --------------------------------------------------------------------------- #
class EventPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    event_type: str
    host_or_celebrant_name: str
    title: str
    invite_headline: str = ""
    invite_message: str = ""
    description: str
    event_date: datetime | None
    event_time: str
    venue_name: str
    venue_address: str
    maps_url: str
    dress_code: str
    gift_details: str
    contact_phone: str
    flyer_url: str
    # Resolved display image (uploaded flyer or external URL). Set by the router.
    flyer_image_url: str = ""
    rsvp_deadline: datetime | None
    # Invite presentation.
    theme_preset: str = "elegant"
    accent_color: str = ""
    background_preset: str = ""


class InvitePublic(BaseModel):
    """Guest-facing invite payload. Deliberately excludes the tree name."""
    event: EventPublic
    accepting_rsvps: bool
    plus_one_allowed: int  # 0, 1 or 2 (max extra guests)
    seat_options: list[int]  # e.g. [1, 2] -> "Just me", "Me +1"
    existing_rsvp: "RsvpPublicOut | None" = None


class RsvpCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=3, max_length=50)
    email: EmailStr | None = None
    attending: bool
    seats_requested: int = Field(1, ge=1, le=3)
    note_to_celebrant: str | None = Field(None, max_length=2000)
    dietary_note: str | None = Field(None, max_length=2000)
    # Consent to receive RSVP confirmation + important updates for THIS event.
    # Only meaningful when an email is supplied; never marketing.
    email_opt_in: bool = False


class RsvpPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    attendance_status: str
    rsvp_status: str
    seats_requested: int


class RsvpCreateResponse(BaseModel):
    rsvp: RsvpPublicOut
    status: str  # accepted | waitlisted | declined
    updated: bool  # True when an existing RSVP was updated instead of created
    message: str


# --------------------------------------------------------------------------- #
# Admin — events
# --------------------------------------------------------------------------- #
EVENT_TYPES = (
    "birthday",
    "wedding",
    "funeral",
    "memorial",
    "anniversary",
    "church",
    "dinner",
    "conference",
    "other",
)
EVENT_STATUSES = ("draft", "active", "closed", "archived")
THEME_PRESETS = ("elegant", "classic", "joyful", "minimal", "formal")
BACKGROUND_PRESETS = ("", "soft", "plain", "festive")

# #RGB or #RRGGBB hex colours (empty allowed = use the theme default).
_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _coerce_theme(v: str | None) -> str:
    return v if v in THEME_PRESETS else "elegant"


def _coerce_background(v: str | None) -> str:
    return v if v in BACKGROUND_PRESETS else ""


def _coerce_accent(v: str | None) -> str:
    """Keep only a valid hex colour; silently drop anything else."""
    if v and _HEX_COLOR.match(v.strip()):
        return v.strip()
    return ""


# Loose email shape for the OPTIONAL host-alert address. Empty disables alerts;
# anything that isn't email-shaped is dropped rather than rejecting the save.
_EMAILISH = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _coerce_host_email(v: str | None) -> str:
    v = (v or "").strip()
    return v.lower() if _EMAILISH.match(v) else ""


class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    event_type: str = Field("other")
    host_or_celebrant_name: str = Field("", max_length=200)
    title: str = Field("", max_length=200)
    invite_headline: str = Field("", max_length=200)
    invite_message: str = Field("")
    description: str = Field("")
    event_date: datetime | None = None
    event_time: str = Field("", max_length=100)
    venue_name: str = Field("", max_length=200)
    venue_address: str = Field("", max_length=400)
    maps_url: str = Field("", max_length=600)
    dress_code: str = Field("")
    gift_details: str = Field("")
    contact_phone: str = Field("", max_length=50)
    flyer_url: str = Field("", max_length=600)
    rsvp_deadline: datetime | None = None
    auto_close_rsvp: bool = True
    theme_preset: str = Field("elegant")
    accent_color: str = Field("", max_length=20)
    background_preset: str = Field("")
    # New events default to "draft" so hosts can finish setup before going live.
    # A non-active event does not accept public RSVPs (see routers/public.py).
    status: str = Field("draft")
    # Host / admin email alerts.
    host_notification_email: str = Field("", max_length=255)
    notify_tree_exhausted: bool = True
    notify_waitlisted_rsvp: bool = False

    @field_validator("event_type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        return v if v in EVENT_TYPES else "other"

    @field_validator("theme_preset")
    @classmethod
    def _valid_theme(cls, v: str) -> str:
        return _coerce_theme(v)

    @field_validator("background_preset")
    @classmethod
    def _valid_background(cls, v: str) -> str:
        return _coerce_background(v)

    @field_validator("accent_color")
    @classmethod
    def _valid_accent(cls, v: str) -> str:
        return _coerce_accent(v)

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in EVENT_STATUSES:
            raise ValueError(f"status must be one of {EVENT_STATUSES}")
        return v

    @field_validator("host_notification_email")
    @classmethod
    def _valid_host_email(cls, v: str) -> str:
        return _coerce_host_email(v)


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    """All fields optional for partial updates."""
    name: str | None = Field(None, min_length=1, max_length=200)
    event_type: str | None = None
    host_or_celebrant_name: str | None = None
    title: str | None = None
    invite_headline: str | None = None
    invite_message: str | None = None
    description: str | None = None
    event_date: datetime | None = None
    event_time: str | None = None
    venue_name: str | None = None
    venue_address: str | None = None
    maps_url: str | None = None
    dress_code: str | None = None
    gift_details: str | None = None
    contact_phone: str | None = None
    flyer_url: str | None = None
    rsvp_deadline: datetime | None = None
    auto_close_rsvp: bool | None = None
    theme_preset: str | None = None
    accent_color: str | None = None
    background_preset: str | None = None
    status: str | None = None
    host_notification_email: str | None = None
    notify_tree_exhausted: bool | None = None
    notify_waitlisted_rsvp: bool | None = None

    @field_validator("theme_preset")
    @classmethod
    def _valid_theme(cls, v):
        return _coerce_theme(v) if v is not None else None

    @field_validator("host_notification_email")
    @classmethod
    def _valid_host_email(cls, v):
        return _coerce_host_email(v) if v is not None else None

    @field_validator("background_preset")
    @classmethod
    def _valid_background(cls, v):
        return _coerce_background(v) if v is not None else None

    @field_validator("accent_color")
    @classmethod
    def _valid_accent(cls, v):
        return _coerce_accent(v) if v is not None else None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v):
        if v is not None and v not in EVENT_STATUSES:
            raise ValueError(f"status must be one of {EVENT_STATUSES}")
        return v


class ReadinessItem(BaseModel):
    key: str
    label: str
    done: bool
    hint: str = ""


class EventReadiness(BaseModel):
    items: list[ReadinessItem]
    completed: int
    total: int


class EventAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    event_type: str
    host_or_celebrant_name: str
    title: str
    invite_headline: str
    invite_message: str
    description: str
    event_date: datetime | None
    event_time: str
    venue_name: str
    venue_address: str
    maps_url: str
    dress_code: str
    gift_details: str
    contact_phone: str
    flyer_url: str
    flyer_storage_path: str
    # Resolved display image (uploaded flyer or external URL). Set by the router.
    flyer_image_url: str = ""
    rsvp_deadline: datetime | None
    auto_close_rsvp: bool
    theme_preset: str
    accent_color: str
    background_preset: str
    status: str
    host_notification_email: str = ""
    notify_tree_exhausted: bool = True
    notify_waitlisted_rsvp: bool = False
    tree_count: int = 0
    rsvp_count: int = 0
    confirmed_seats: int = 0
    # Event-level RSVP availability (ignores per-tree pauses, which are per-tree).
    # Lets admins see *why* an event's public invites are closed. Set by router.
    accepting_rsvps: bool = True
    availability_reason: str = "accepting"
    availability_label: str = "Accepting RSVPs"
    # Readiness summary (completed/total checklist items) so the workspace
    # switcher can show per-event readiness without extra requests. Set by router.
    readiness_completed: int = 0
    readiness_total: int = 0
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Admin — invite trees
# --------------------------------------------------------------------------- #
class InviteTreeCreate(BaseModel):
    event_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=200)
    allocated_seats: int = Field(..., ge=0)
    max_extra_guests: int = Field(0, ge=0, le=2)


class InviteTreeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    allocated_seats: int | None = Field(None, ge=0)
    max_extra_guests: int | None = Field(None, ge=0, le=2)
    status: str | None = Field(None, pattern="^(active|paused)$")


class InviteTreeOut(BaseModel):
    id: str
    event_id: str
    name: str
    token: str
    allocated_seats: int
    max_extra_guests: int
    status: str
    computed_status: str
    used_seats: int
    remaining_seats: int
    rsvp_count: int
    invite_url: str
    # Whether guests using THIS tree's link can currently RSVP, and why not.
    # Combines the event status/deadline with this tree's own pause state.
    accepting_rsvps: bool = True
    availability_reason: str = "accepting"
    availability_label: str = "Accepting RSVPs"
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Admin — RSVPs
# --------------------------------------------------------------------------- #
class RsvpAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    invite_tree_id: str
    invite_tree_name: str
    full_name: str
    phone: str
    email: str | None
    attendance_status: str
    rsvp_status: str
    seats_requested: int
    note_to_celebrant: str | None
    dietary_note: str | None
    # Email communications (Phase 5).
    email_opt_in: bool = False
    confirmation_sent_at: datetime | None = None
    reminder_sent_at: datetime | None = None
    status_email_sent_at: datetime | None = None
    check_in_email_sent_at: datetime | None = None
    # Event-day check-in.
    checked_in_at: datetime | None = None
    checked_in_seats: int | None = None
    checked_in_by_admin_id: str | None = None
    checked_in_by: str | None = None  # resolved admin name/email
    check_in_token: str
    created_at: datetime
    updated_at: datetime


class RsvpUpdate(BaseModel):
    rsvp_status: str | None = Field(
        None, pattern="^(accepted|declined|waitlisted|cancelled)$"
    )
    seats_requested: int | None = Field(None, ge=1, le=3)


# --------------------------------------------------------------------------- #
# Admin — event-day check-in
# --------------------------------------------------------------------------- #
class CheckInRequest(BaseModel):
    # Actual seats present. Defaults to the RSVP's seats_requested when omitted.
    seats: int | None = Field(None, ge=1)


class CheckedInSeatsUpdate(BaseModel):
    checked_in_seats: int = Field(..., ge=1)


class ManifestEntry(BaseModel):
    id: str
    full_name: str
    phone: str
    email: str | None
    invite_tree_id: str
    invite_tree_name: str
    rsvp_status: str
    seats_requested: int
    checked_in: bool
    checked_in_at: datetime | None
    checked_in_seats: int | None
    note_to_celebrant: str | None
    dietary_note: str | None


class ManifestTreeTotal(BaseModel):
    invite_tree_id: str
    invite_tree_name: str
    guests: int
    confirmed_seats: int
    checked_in_seats: int


class GuestManifest(BaseModel):
    event_id: str
    event_name: str
    entries: list[ManifestEntry]
    total_confirmed_seats: int
    total_checked_in_seats: int
    total_pending_seats: int
    tree_totals: list[ManifestTreeTotal]


# --------------------------------------------------------------------------- #
# Admin — dashboard
# --------------------------------------------------------------------------- #
class DashboardSummary(BaseModel):
    total_allocated_seats: int
    total_confirmed_seats: int
    remaining_seats: int
    total_rsvps: int
    accepted_rsvps: int
    declined_rsvps: int
    waitlisted_rsvps: int
    cancelled_rsvps: int
    exhausted_trees: int
    total_trees: int
    # Event-day check-in metrics.
    checked_in_rsvps: int = 0
    checked_in_seats: int = 0
    confirmed_not_checked_in: int = 0
    check_in_rate: float = 0.0


class SeatUsagePoint(BaseModel):
    tree: str
    allocated: int
    used: int
    remaining: int


class StatusBreakdownPoint(BaseModel):
    status: str
    count: int


class TrendPoint(BaseModel):
    date: str
    count: int


class DashboardCharts(BaseModel):
    seat_usage_by_tree: list[SeatUsagePoint]
    rsvp_status_breakdown: list[StatusBreakdownPoint]
    rsvps_over_time: list[TrendPoint]
    capacity: dict[str, int]


# --------------------------------------------------------------------------- #
# Admin — guest communications (Phase 5)
# --------------------------------------------------------------------------- #
class EmailBackendStatus(BaseModel):
    backend: str  # console | resend
    is_live_provider: bool
    configured: bool
    from_address: str
    from_name: str


class CommunicationLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    event_id: str
    rsvp_id: str | None = None
    communication_type: str
    channel: str
    recipient: str
    provider: str
    status: str
    provider_message_id: str | None = None
    error_summary: str | None = None
    # Human-readable, sanitized explanation of a skipped/failed outcome (derived
    # server-side from the status + safe metadata). Never contains secrets.
    reason: str | None = None
    sent_at: datetime | None = None
    created_at: datetime


class CommunicationLogPage(BaseModel):
    items: list[CommunicationLogOut]
    total: int


class ReminderRecipient(BaseModel):
    full_name: str
    email: str
    seats_requested: int
    checked_in: bool


class EmailPreview(BaseModel):
    subject: str
    html: str
    text: str


class ReminderAudience(BaseModel):
    eligible_count: int
    total_accepted: int
    accepted_without_email: int
    accepted_not_opted_in: int
    checked_in_eligible: int
    exclude_checked_in: bool
    last_reminder_sent_at: datetime | None = None
    sample: list[ReminderRecipient]
    preview: EmailPreview | None = None


class CommunicationsStatus(BaseModel):
    event_id: str
    event_name: str
    email: EmailBackendStatus
    host_notification_email: str
    notify_tree_exhausted: bool
    notify_waitlisted_rsvp: bool
    eligible_reminder_count: int
    last_reminder_sent_at: datetime | None = None
    recent: list[CommunicationLogOut]


class ReminderSendRequest(BaseModel):
    exclude_checked_in: bool = False
    confirm_resend: bool = False


class ReminderSendResult(BaseModel):
    sent: int
    failed: int
    skipped: int
    message: str


class NotifyResult(BaseModel):
    status: str  # sent | skipped | failed | not_attempted
    detail: str
