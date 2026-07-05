"""Single source of truth for whether an invite can currently accept RSVPs.

The public guest page only ever shows a polite generic message, but admins need
to know *why* an invitation is closed. This module computes both a boolean and a
machine-readable reason so the admin UI can explain it precisely.

Design notes
------------
* Deadline comparison is timezone-safe. Deadlines are stored as naive UTC (the
  frontend converts the admin's local ``datetime-local`` value to a UTC ISO
  string before saving), so a naive stored value is treated as UTC and an
  already-aware value is converted to UTC. Both sides of the comparison are
  therefore aware-UTC, which avoids the "can't compare naive and aware" error
  and stops production (UTC) from closing local events at the wrong instant.
* A *date-only* / midnight deadline gets end-of-day grace: a deadline whose time
  component is exactly 00:00:00 stays open through the whole of that calendar day
  rather than expiring at its very start. This is applied purely in the
  comparison — no stored event date is ever mutated.
* Tree capacity exhaustion is deliberately NOT a closure. A full tree still
  "accepts" here; ``seat_logic.evaluate_new_rsvp`` then waitlists the guest.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# --- Reason codes (stable, machine-readable) -------------------------------- #
ACCEPTING = "accepting"
EVENT_DRAFT = "event_draft"
EVENT_CLOSED = "event_closed"
EVENT_ARCHIVED = "event_archived"
EVENT_INACTIVE = "event_inactive"
TREE_PAUSED = "tree_paused"
DEADLINE_PASSED = "deadline_passed"

# Short admin-facing labels for each reason.
REASON_LABELS: dict[str, str] = {
    ACCEPTING: "Accepting RSVPs",
    EVENT_DRAFT: "Event is still in draft",
    EVENT_CLOSED: "Event is closed",
    EVENT_ARCHIVED: "Event is archived",
    EVENT_INACTIVE: "Event is not active",
    TREE_PAUSED: "Invite tree is paused",
    DEADLINE_PASSED: "RSVP deadline has passed",
}


@dataclass(frozen=True)
class Availability:
    """Result of an availability check."""

    accepting: bool
    reason: str

    @property
    def label(self) -> str:
        return REASON_LABELS.get(self.reason, "Unavailable")


def _as_utc(dt: datetime | None) -> datetime | None:
    """Return ``dt`` as an aware UTC datetime (naive values are assumed UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def deadline_cutoff(deadline: datetime | None) -> datetime | None:
    """Effective closing instant (aware UTC) for an RSVP deadline.

    A midnight (00:00:00) deadline is treated as end-of-day so a date-only
    deadline stays open for the whole day instead of expiring at its start.
    """
    cutoff = _as_utc(deadline)
    if cutoff is None:
        return None
    if cutoff.hour == 0 and cutoff.minute == 0 and cutoff.second == 0:
        cutoff = cutoff + timedelta(hours=23, minutes=59, seconds=59)
    return cutoff


def evaluate(event, tree=None, now: datetime | None = None) -> Availability:
    """Compute availability for an event (optionally scoped to one invite tree).

    Event-level reasons (draft/closed/archived, deadline) apply to every tree, so
    they are reported first. A per-tree pause is only considered when a tree is
    supplied — pass ``tree=None`` for an event-wide check (dashboard/settings).
    """
    status = (event.status or "").lower()
    if status == "draft":
        return Availability(False, EVENT_DRAFT)
    if status == "closed":
        return Availability(False, EVENT_CLOSED)
    if status == "archived":
        return Availability(False, EVENT_ARCHIVED)
    if status != "active":
        return Availability(False, EVENT_INACTIVE)

    if tree is not None and (tree.status or "").lower() == "paused":
        return Availability(False, TREE_PAUSED)

    now_utc = _as_utc(now) or datetime.now(timezone.utc)
    cutoff = deadline_cutoff(event.rsvp_deadline)
    if event.auto_close_rsvp and cutoff is not None and now_utc > cutoff:
        return Availability(False, DEADLINE_PASSED)

    return Availability(True, ACCEPTING)
