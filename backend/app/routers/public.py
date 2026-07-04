"""Public, unauthenticated guest invite + RSVP endpoints."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..email import service as email_service
from ..models import InviteTree, Rsvp
from ..schemas import (
    EventPublic,
    InvitePublic,
    RsvpCreate,
    RsvpCreateResponse,
    RsvpPublicOut,
)
from ..ratelimit import rate_limit_rsvp
from ..seat_logic import (
    allowed_seat_options,
    evaluate_new_rsvp,
    remaining_seats,
)
from ..storage import resolve_flyer_url
from ..utils import normalize_phone

logger = logging.getLogger("rsvp60")

router = APIRouter(prefix="/api/invites", tags=["public"])


def _get_tree_by_token(db: Session, token: str) -> InviteTree:
    tree = db.execute(
        select(InviteTree).where(InviteTree.token == token)
    ).scalar_one_or_none()
    if tree is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This invite link is not valid. Please check the link you were sent.",
        )
    return tree


def _is_accepting(tree: InviteTree, event) -> bool:
    """RSVPs are open only when the tree is active, the event is active, and —
    when auto-close is enabled — the RSVP deadline (if any) has not passed.

    When ``auto_close_rsvp`` is False the deadline is informational only and the
    RSVP form stays open past it.
    """
    if tree.status == "paused":
        return False
    if event.status != "active":
        return False
    if (
        event.auto_close_rsvp
        and event.rsvp_deadline
        and datetime.utcnow() > event.rsvp_deadline
    ):
        return False
    return True


@router.get("/{token}", response_model=InvitePublic)
def get_invite(token: str, db: Session = Depends(get_db)):
    """Return the guest-facing invite. Never exposes the invite tree name."""
    tree = _get_tree_by_token(db, token)
    event = tree.event

    remaining = remaining_seats(db, tree)
    accepting = _is_accepting(tree, event)
    options = allowed_seat_options(tree, remaining) if accepting else []

    event_public = EventPublic.model_validate(event)
    event_public.flyer_image_url = resolve_flyer_url(
        event.flyer_storage_path, event.flyer_url
    )

    return InvitePublic(
        event=event_public,
        accepting_rsvps=accepting,
        plus_one_allowed=tree.max_extra_guests,
        seat_options=options,
        existing_rsvp=None,
    )


@router.post("/{token}/rsvp", response_model=RsvpCreateResponse)
def submit_rsvp(
    token: str,
    payload: RsvpCreate,
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit_rsvp),
):
    tree = _get_tree_by_token(db, token)

    if not _is_accepting(tree, tree.event):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="RSVPs for this invitation are currently closed. Please contact the host.",
        )

    phone = normalize_phone(payload.phone)
    if len(phone.lstrip("+")) < 7:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please enter a valid phone number so the host can reach you.",
        )
    attending = payload.attending
    requested = payload.seats_requested if attending else 0
    # Consent is only meaningful when an email was actually supplied.
    email_opt_in = bool(payload.email and payload.email_opt_in)

    # Duplicate protection: one RSVP per phone number per event.
    existing = db.execute(
        select(Rsvp).where(
            Rsvp.event_id == tree.event_id,
            Rsvp.phone == phone,
        )
    ).scalar_one_or_none()

    # Remaining capacity for this tree, excluding the guest's own existing RSVP
    # so an update doesn't double-count their previously-held seats.
    remaining = remaining_seats(
        db, tree, exclude_rsvp_id=existing.id if existing else None
    )
    new_status, seats_to_store = evaluate_new_rsvp(attending, requested, remaining)

    if existing is not None:
        existing.invite_tree_id = tree.id
        existing.full_name = payload.full_name.strip()
        existing.email = payload.email
        existing.email_opt_in = email_opt_in
        existing.attendance_status = "attending" if attending else "declined"
        existing.rsvp_status = new_status
        existing.seats_requested = seats_to_store
        existing.note_to_celebrant = payload.note_to_celebrant
        existing.dietary_note = payload.dietary_note
        rsvp = existing
        updated = True
    else:
        rsvp = Rsvp(
            event_id=tree.event_id,
            invite_tree_id=tree.id,
            full_name=payload.full_name.strip(),
            phone=phone,
            email=payload.email,
            email_opt_in=email_opt_in,
            attendance_status="attending" if attending else "declined",
            rsvp_status=new_status,
            seats_requested=seats_to_store,
            note_to_celebrant=payload.note_to_celebrant,
            dietary_note=payload.dietary_note,
        )
        db.add(rsvp)
        updated = False

    db.commit()
    db.refresh(rsvp)

    messages = {
        "accepted": "Thank you! Your RSVP is confirmed. We can't wait to celebrate with you.",
        "waitlisted": (
            "Your RSVP has been received. This invite allocation is currently full, "
            "so your attendance is pending confirmation from the host."
        ),
        "declined": "Thank you for letting us know. You'll be missed!",
    }

    response = RsvpCreateResponse(
        rsvp=RsvpPublicOut.model_validate(rsvp),
        status=new_status,
        updated=updated,
        message=messages.get(new_status, "Your RSVP has been received."),
    )

    # --- Email side effects (best-effort; never affect the response above) ---
    # The RSVP is already committed; a delivery hiccup can't roll it back.
    try:
        event = tree.event
        email_service.send_rsvp_confirmation(db, rsvp, event)
        if new_status == "waitlisted":
            email_service.send_host_alert(
                db, event, "host_waitlisted_rsvp",
                {"guest_name": rsvp.full_name, "seats": seats_to_store},
                rsvp_id=rsvp.id,
            )
        email_service.maybe_alert_tree_exhausted(db, tree, event)
    except Exception:  # pragma: no cover - defensive; guest never sees this
        logger.exception("RSVP email side effects failed for rsvp=%s", rsvp.id)

    return response
