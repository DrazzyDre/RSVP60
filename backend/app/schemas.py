"""Pydantic request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminOut


# --------------------------------------------------------------------------- #
# Public invite
# --------------------------------------------------------------------------- #
class EventPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    event_type: str
    host_or_celebrant_name: str
    title: str
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
    rsvp_deadline: datetime | None


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


class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    event_type: str = Field("other")
    host_or_celebrant_name: str = Field("", max_length=200)
    title: str = Field("", max_length=200)
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
    status: str = Field("active")

    @field_validator("event_type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        return v if v in EVENT_TYPES else "other"

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in EVENT_STATUSES:
            raise ValueError(f"status must be one of {EVENT_STATUSES}")
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    """All fields optional for partial updates."""
    name: str | None = Field(None, min_length=1, max_length=200)
    event_type: str | None = None
    host_or_celebrant_name: str | None = None
    title: str | None = None
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
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v):
        if v is not None and v not in EVENT_STATUSES:
            raise ValueError(f"status must be one of {EVENT_STATUSES}")
        return v


class EventAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    event_type: str
    host_or_celebrant_name: str
    title: str
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
    rsvp_deadline: datetime | None
    status: str
    tree_count: int = 0
    rsvp_count: int = 0
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
    created_at: datetime
    updated_at: datetime


class RsvpUpdate(BaseModel):
    rsvp_status: str | None = Field(
        None, pattern="^(accepted|declined|waitlisted|cancelled)$"
    )
    seats_requested: int | None = Field(None, ge=1, le=3)


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
