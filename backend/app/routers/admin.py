"""Protected admin endpoints: auth, events, dashboard, invite trees, RSVPs, export.

Everything below (trees, RSVPs, dashboard) is scoped to a single event via an
``event_id`` query parameter so one event's data never leaks into another's.
"""

import csv
import io
from collections import defaultdict

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_admin, log_action
from ..models import Admin, Event, InviteTree, Rsvp, new_uuid
from ..storage import (
    ALLOWED_IMAGE_TYPES,
    StorageError,
    get_storage,
    resolve_flyer_url,
)
from ..schemas import (
    AdminOut,
    DashboardCharts,
    DashboardSummary,
    EventAdminOut,
    EventCreate,
    EventReadiness,
    EventUpdate,
    InviteTreeCreate,
    InviteTreeOut,
    InviteTreeUpdate,
    LoginRequest,
    ReadinessItem,
    RsvpAdminOut,
    RsvpUpdate,
    SeatUsagePoint,
    StatusBreakdownPoint,
    TokenResponse,
    TrendPoint,
)
from ..security import create_access_token, verify_password
from ..seat_logic import computed_status, remaining_seats, used_seats

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    admin = db.execute(
        select(Admin).where(Admin.email == payload.email.lower())
    ).scalar_one_or_none()
    if admin is None or not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    token = create_access_token(admin.id, {"email": admin.email})
    return TokenResponse(access_token=token, admin=AdminOut.model_validate(admin))


@router.get("/me", response_model=AdminOut)
def me(admin: Admin = Depends(get_current_admin)):
    return AdminOut.model_validate(admin)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _get_event_or_404(db: Session, event_id: str) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


def _serialize_event(db: Session, event: Event) -> EventAdminOut:
    tree_count = int(
        db.execute(
            select(func.count(InviteTree.id)).where(InviteTree.event_id == event.id)
        ).scalar_one()
    )
    rsvp_count = int(
        db.execute(
            select(func.count(Rsvp.id)).where(Rsvp.event_id == event.id)
        ).scalar_one()
    )
    out = EventAdminOut.model_validate(event)
    out.tree_count = tree_count
    out.rsvp_count = rsvp_count
    out.flyer_image_url = resolve_flyer_url(event.flyer_storage_path, event.flyer_url)
    return out


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #
@router.get("/events", response_model=list[EventAdminOut])
def list_events(
    db: Session = Depends(get_db), admin: Admin = Depends(get_current_admin)
):
    events = db.execute(select(Event).order_by(Event.created_at)).scalars().all()
    return [_serialize_event(db, e) for e in events]


@router.post("/events", response_model=EventAdminOut, status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = Event(**payload.model_dump())
    db.add(event)
    db.flush()
    log_action(db, admin, "create", "event", event.id, {"name": event.name})
    db.commit()
    db.refresh(event)
    return _serialize_event(db, event)


@router.get("/events/{event_id}", response_model=EventAdminOut)
def get_event(
    event_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    return _serialize_event(db, _get_event_or_404(db, event_id))


@router.patch("/events/{event_id}", response_model=EventAdminOut)
def update_event(
    event_id: str,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(event, field, value)
    log_action(db, admin, "update", "event", event.id, {"fields": list(data)})
    db.commit()
    db.refresh(event)
    return _serialize_event(db, event)


# --------------------------------------------------------------------------- #
# Flyer upload / removal
# --------------------------------------------------------------------------- #
def _detect_image_type(file: UploadFile) -> str | None:
    """Return the accepted content type, or None if unsupported.

    Prefers the declared content type; falls back to the filename extension so
    a browser that sends a generic type still works.
    """
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type in ALLOWED_IMAGE_TYPES:
        return content_type
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    ext_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return ext_map.get(ext)


@router.post("/events/{event_id}/flyer", response_model=EventAdminOut)
async def upload_flyer(
    event_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)

    content_type = _detect_image_type(file)
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Please upload a JPG, PNG or WebP image.",
        )

    max_mb = settings.max_upload_bytes / (1024 * 1024)
    too_large = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Image is too large. The maximum size is {max_mb:.0f} MB.",
    )
    # Reject oversized uploads up front (when the client reports a size) so we
    # don't buffer a huge payload just to reject it. Re-checked after read.
    if file.size is not None and file.size > settings.max_upload_bytes:
        raise too_large

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty. Please choose an image.",
        )
    if len(data) > settings.max_upload_bytes:
        raise too_large

    ext = ALLOWED_IMAGE_TYPES[content_type]
    key = f"flyers/{event_id}/{new_uuid()}.{ext}"
    storage = get_storage()
    try:
        storage.save(key, data, content_type)
    except StorageError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not store the flyer right now. Please try again.",
        )

    previous = event.flyer_storage_path
    event.flyer_storage_path = key
    if previous and previous != key:
        storage.delete(previous)

    log_action(db, admin, "upload_flyer", "event", event.id, {"key": key})
    db.commit()
    db.refresh(event)
    return _serialize_event(db, event)


@router.delete("/events/{event_id}/flyer", response_model=EventAdminOut)
def remove_flyer(
    event_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)
    if event.flyer_storage_path:
        get_storage().delete(event.flyer_storage_path)
        event.flyer_storage_path = ""
        log_action(db, admin, "remove_flyer", "event", event.id, {})
        db.commit()
        db.refresh(event)
    return _serialize_event(db, event)


# --------------------------------------------------------------------------- #
# Event readiness checklist
# --------------------------------------------------------------------------- #
@router.get("/events/{event_id}/readiness", response_model=EventReadiness)
def event_readiness(
    event_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """A simple pre-share checklist so admins can see what is still missing."""
    event = _get_event_or_404(db, event_id)
    tree_count = int(
        db.execute(
            select(func.count(InviteTree.id)).where(InviteTree.event_id == event.id)
        ).scalar_one()
    )

    has_details = bool(
        event.title
        and event.event_date
        and event.venue_name
        and (event.invite_message or event.description)
    )
    items = [
        ReadinessItem(
            key="details",
            label="Event details completed",
            done=has_details,
            hint="Add a title, date, venue and invitation copy.",
        ),
        ReadinessItem(
            key="flyer",
            label="Flyer / image added",
            done=bool(event.flyer_storage_path or event.flyer_url),
            hint="Upload a flyer image or paste an image URL.",
        ),
        ReadinessItem(
            key="venue_map",
            label="Venue & map link added",
            done=bool(event.venue_name and event.maps_url),
            hint="Add the venue name and a Google Maps link.",
        ),
        ReadinessItem(
            key="gifts",
            label="Gift details added",
            done=bool(event.gift_details),
            hint="Let guests know your gift preferences (optional).",
        ),
        ReadinessItem(
            key="trees",
            label="At least one invite tree created",
            done=tree_count >= 1,
            hint="Create an invite tree to generate a shareable link.",
        ),
        ReadinessItem(
            key="deadline",
            label="RSVP deadline set",
            done=bool(event.rsvp_deadline),
            hint="Set a deadline so guests know when to respond.",
        ),
    ]
    completed = sum(1 for i in items if i.done)
    return EventReadiness(items=items, completed=completed, total=len(items))


# --------------------------------------------------------------------------- #
# Invite trees (scoped to an event)
# --------------------------------------------------------------------------- #
def _serialize_tree(db: Session, tree: InviteTree) -> InviteTreeOut:
    used = used_seats(db, tree.id)
    remaining = max(tree.allocated_seats - used, 0)
    rsvp_count = int(
        db.execute(
            select(func.count(Rsvp.id)).where(Rsvp.invite_tree_id == tree.id)
        ).scalar_one()
    )
    return InviteTreeOut(
        id=tree.id,
        event_id=tree.event_id,
        name=tree.name,
        token=tree.token,
        allocated_seats=tree.allocated_seats,
        max_extra_guests=tree.max_extra_guests,
        status=tree.status,
        computed_status=computed_status(tree, remaining),
        used_seats=used,
        remaining_seats=remaining,
        rsvp_count=rsvp_count,
        invite_url=f"{settings.site_url.rstrip('/')}/invite/{tree.token}",
        created_at=tree.created_at,
        updated_at=tree.updated_at,
    )


@router.get("/invite-trees", response_model=list[InviteTreeOut])
def list_invite_trees(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _get_event_or_404(db, event_id)
    trees = (
        db.execute(
            select(InviteTree)
            .where(InviteTree.event_id == event_id)
            .order_by(InviteTree.created_at)
        )
        .scalars()
        .all()
    )
    return [_serialize_tree(db, t) for t in trees]


@router.post("/invite-trees", response_model=InviteTreeOut, status_code=201)
def create_invite_tree(
    payload: InviteTreeCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _get_event_or_404(db, payload.event_id)
    tree = InviteTree(
        event_id=payload.event_id,
        name=payload.name.strip(),
        allocated_seats=payload.allocated_seats,
        max_extra_guests=payload.max_extra_guests,
        status="active",
    )
    db.add(tree)
    db.flush()
    log_action(db, admin, "create", "invite_tree", tree.id, {"name": tree.name})
    db.commit()
    db.refresh(tree)
    return _serialize_tree(db, tree)


@router.patch("/invite-trees/{tree_id}", response_model=InviteTreeOut)
def update_invite_tree(
    tree_id: str,
    payload: InviteTreeUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    tree = db.get(InviteTree, tree_id)
    if tree is None:
        raise HTTPException(status_code=404, detail="Invite tree not found.")

    data = payload.model_dump(exclude_unset=True)
    if "allocated_seats" in data:
        used = used_seats(db, tree.id)
        if data["allocated_seats"] < used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot allocate fewer than {used} seats — that many are "
                    "already confirmed for this tree."
                ),
            )
    for field, value in data.items():
        setattr(tree, field, value.strip() if field == "name" else value)

    log_action(db, admin, "update", "invite_tree", tree.id, data)
    db.commit()
    db.refresh(tree)
    return _serialize_tree(db, tree)


# --------------------------------------------------------------------------- #
# RSVPs (scoped to an event)
# --------------------------------------------------------------------------- #
def _serialize_rsvp(rsvp: Rsvp) -> RsvpAdminOut:
    return RsvpAdminOut(
        id=rsvp.id,
        invite_tree_id=rsvp.invite_tree_id,
        invite_tree_name=rsvp.invite_tree.name if rsvp.invite_tree else "",
        full_name=rsvp.full_name,
        phone=rsvp.phone,
        email=rsvp.email,
        attendance_status=rsvp.attendance_status,
        rsvp_status=rsvp.rsvp_status,
        seats_requested=rsvp.seats_requested,
        note_to_celebrant=rsvp.note_to_celebrant,
        dietary_note=rsvp.dietary_note,
        created_at=rsvp.created_at,
        updated_at=rsvp.updated_at,
    )


def _filtered_rsvp_query(event_id, status_f, tree_id, search):
    stmt = (
        select(Rsvp)
        .join(InviteTree, Rsvp.invite_tree_id == InviteTree.id)
        .where(Rsvp.event_id == event_id)
    )
    if status_f:
        stmt = stmt.where(Rsvp.rsvp_status == status_f)
    if tree_id:
        stmt = stmt.where(Rsvp.invite_tree_id == tree_id)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            (Rsvp.full_name.ilike(like))
            | (Rsvp.phone.ilike(like))
            | (Rsvp.email.ilike(like))
        )
    return stmt.order_by(Rsvp.created_at.desc())


@router.get("/rsvps", response_model=list[RsvpAdminOut])
def list_rsvps(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    status_f: str | None = Query(None, alias="status"),
    invite_tree_id: str | None = None,
    search: str | None = None,
):
    _get_event_or_404(db, event_id)
    stmt = _filtered_rsvp_query(event_id, status_f, invite_tree_id, search)
    rsvps = db.execute(stmt).scalars().all()
    return [_serialize_rsvp(r) for r in rsvps]


@router.patch("/rsvps/{rsvp_id}", response_model=RsvpAdminOut)
def update_rsvp(
    rsvp_id: str,
    payload: RsvpUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    rsvp = db.get(Rsvp, rsvp_id)
    if rsvp is None:
        raise HTTPException(status_code=404, detail="RSVP not found.")

    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("rsvp_status", rsvp.rsvp_status)
    new_seats = data.get("seats_requested", rsvp.seats_requested)

    # When moving an RSVP to "accepted", enforce seat availability.
    if new_status == "accepted":
        tree = rsvp.invite_tree
        seats = max(1, new_seats)
        remaining = remaining_seats(db, tree, exclude_rsvp_id=rsvp.id)
        if seats > remaining:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Not enough seats: {remaining} remaining in '{tree.name}', "
                    f"but this RSVP needs {seats}. Free up seats or keep it waitlisted."
                ),
            )
        rsvp.seats_requested = seats
        rsvp.attendance_status = "attending"
    else:
        if "seats_requested" in data:
            rsvp.seats_requested = new_seats
        if new_status == "declined":
            rsvp.attendance_status = "declined"

    rsvp.rsvp_status = new_status
    log_action(db, admin, "update", "rsvp", rsvp.id, data)
    db.commit()
    db.refresh(rsvp)
    return _serialize_rsvp(rsvp)


@router.get("/rsvps/export")
def export_rsvps(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    status_f: str | None = Query(None, alias="status"),
    invite_tree_id: str | None = None,
    search: str | None = None,
):
    _get_event_or_404(db, event_id)
    stmt = _filtered_rsvp_query(event_id, status_f, invite_tree_id, search)
    rsvps = db.execute(stmt).scalars().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Full Name",
            "Phone",
            "Email",
            "Invite Tree",
            "Attendance",
            "RSVP Status",
            "Seats Requested",
            "Note to Celebrant",
            "Dietary/Accessibility Note",
            "Submitted At",
        ]
    )
    for r in rsvps:
        writer.writerow(
            [
                r.full_name,
                r.phone,
                r.email or "",
                r.invite_tree.name if r.invite_tree else "",
                r.attendance_status,
                r.rsvp_status,
                r.seats_requested,
                (r.note_to_celebrant or "").replace("\n", " "),
                (r.dietary_note or "").replace("\n", " "),
                r.created_at.isoformat(),
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=rsvp60-guests.csv"},
    )


# --------------------------------------------------------------------------- #
# Dashboard (scoped to an event)
# --------------------------------------------------------------------------- #
@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _get_event_or_404(db, event_id)
    trees = (
        db.execute(select(InviteTree).where(InviteTree.event_id == event_id))
        .scalars()
        .all()
    )
    total_allocated = sum(t.allocated_seats for t in trees)

    confirmed_seats = int(
        db.execute(
            select(func.coalesce(func.sum(Rsvp.seats_requested), 0)).where(
                Rsvp.event_id == event_id,
                Rsvp.rsvp_status == "accepted",
            )
        ).scalar_one()
    )

    status_counts = dict(
        db.execute(
            select(Rsvp.rsvp_status, func.count(Rsvp.id))
            .where(Rsvp.event_id == event_id)
            .group_by(Rsvp.rsvp_status)
        ).all()
    )
    total_rsvps = sum(status_counts.values())

    exhausted = sum(
        1
        for t in trees
        if t.status != "paused" and remaining_seats(db, t) <= 0 and t.allocated_seats > 0
    )

    return DashboardSummary(
        total_allocated_seats=total_allocated,
        total_confirmed_seats=confirmed_seats,
        remaining_seats=max(total_allocated - confirmed_seats, 0),
        total_rsvps=total_rsvps,
        accepted_rsvps=status_counts.get("accepted", 0),
        declined_rsvps=status_counts.get("declined", 0),
        waitlisted_rsvps=status_counts.get("waitlisted", 0),
        cancelled_rsvps=status_counts.get("cancelled", 0),
        exhausted_trees=exhausted,
        total_trees=len(trees),
    )


@router.get("/dashboard/charts", response_model=DashboardCharts)
def dashboard_charts(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _get_event_or_404(db, event_id)
    trees = (
        db.execute(
            select(InviteTree)
            .where(InviteTree.event_id == event_id)
            .order_by(InviteTree.created_at)
        )
        .scalars()
        .all()
    )
    seat_usage = []
    total_allocated = 0
    total_used = 0
    for t in trees:
        used = used_seats(db, t.id)
        total_allocated += t.allocated_seats
        total_used += used
        seat_usage.append(
            SeatUsagePoint(
                tree=t.name,
                allocated=t.allocated_seats,
                used=used,
                remaining=max(t.allocated_seats - used, 0),
            )
        )

    status_rows = db.execute(
        select(Rsvp.rsvp_status, func.count(Rsvp.id))
        .where(Rsvp.event_id == event_id)
        .group_by(Rsvp.rsvp_status)
    ).all()
    breakdown = [StatusBreakdownPoint(status=s, count=c) for s, c in status_rows]

    # RSVP submissions per day for this event.
    per_day: dict[str, int] = defaultdict(int)
    for (created,) in db.execute(
        select(Rsvp.created_at).where(Rsvp.event_id == event_id)
    ).all():
        per_day[created.date().isoformat()] += 1
    trend = [TrendPoint(date=d, count=per_day[d]) for d in sorted(per_day)]

    return DashboardCharts(
        seat_usage_by_tree=seat_usage,
        rsvp_status_breakdown=breakdown,
        rsvps_over_time=trend,
        capacity={"used": total_used, "allocated": total_allocated},
    )
