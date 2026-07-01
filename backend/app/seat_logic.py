"""Seat / quota logic. The backend is the single source of truth for all of
this — the frontend only mirrors it for UX.

Seat rules
----------
* Guest alone      -> 1 seat
* Guest +1         -> 2 seats
* Guest +2         -> 3 seats

A tree's ``max_extra_guests`` caps how many *extra* guests a single RSVP may
bring (0, 1 or 2), so the max seats per RSVP is ``1 + max_extra_guests``.

Only "accepted" RSVPs consume seats. Waitlisted / declined / cancelled RSVPs
never count against a tree's allocation.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import InviteTree, Rsvp


def used_seats(db: Session, tree_id: str, exclude_rsvp_id: str | None = None) -> int:
    """Total confirmed seats consumed by a tree (accepted RSVPs only)."""
    stmt = select(func.coalesce(func.sum(Rsvp.seats_requested), 0)).where(
        Rsvp.invite_tree_id == tree_id,
        Rsvp.rsvp_status == "accepted",
    )
    if exclude_rsvp_id:
        stmt = stmt.where(Rsvp.id != exclude_rsvp_id)
    return int(db.execute(stmt).scalar_one())


def remaining_seats(db: Session, tree: InviteTree, exclude_rsvp_id: str | None = None) -> int:
    return max(tree.allocated_seats - used_seats(db, tree.id, exclude_rsvp_id), 0)


def computed_status(tree: InviteTree, remaining: int) -> str:
    """Human-facing lifecycle state derived from stored status + seat usage."""
    if tree.status == "paused":
        return "paused"
    if remaining <= 0:
        return "exhausted"
    if tree.allocated_seats > 0 and remaining <= max(1, round(tree.allocated_seats * 0.1)):
        return "almost_full"
    return "active"


def allowed_seat_options(tree: InviteTree, remaining: int) -> list[int]:
    """Seat counts the guest is allowed to choose from.

    Filtered by BOTH the tree's plus-one rule and the remaining capacity.
    Always offers at least "Just me" (1) so a guest can still be waitlisted
    when the allocation is full.
    """
    max_by_rule = 1 + max(0, min(tree.max_extra_guests, 2))
    options = [n for n in range(1, max_by_rule + 1) if n <= remaining]
    if not options:
        options = [1]
    return options


def evaluate_new_rsvp(attending: bool, seats_requested: int, remaining: int) -> tuple[str, int]:
    """Return ``(rsvp_status, seats_to_store)`` for a fresh guest RSVP.

    * Not attending            -> ("declined", 0)
    * Attending & fits capacity -> ("accepted", seats_requested)
    * Attending & over capacity -> ("waitlisted", seats_requested)
    """
    if not attending:
        return "declined", 0
    seats = max(1, seats_requested)
    if seats <= remaining:
        return "accepted", seats
    return "waitlisted", seats
