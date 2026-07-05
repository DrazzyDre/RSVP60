"""Protected admin endpoints: auth, events, dashboard, invite trees, RSVPs, export.

Everything below (trees, RSVPs, dashboard) is scoped to a single event via an
``event_id`` query parameter so one event's data never leaks into another's.
"""

import csv
import io
import json
import logging
from collections import defaultdict
from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..availability import evaluate as evaluate_availability
from ..config import settings
from ..database import get_db
from ..deps import get_current_admin, log_action, require_editor, require_owner
from ..email import service as email_service
from ..models import Admin, AuditLog, Event, InviteTree, Rsvp, new_uuid
from ..ratelimit import (
    check_login_not_blocked,
    record_login_failure,
    reset_login_failures,
)
from ..roles import OWNER
from ..storage import (
    ALLOWED_IMAGE_TYPES,
    BUCKET_NOT_FOUND,
    STORAGE_AUTH_FAILED,
    STORAGE_PERMISSION_DENIED,
    STORAGE_TIMEOUT,
    StorageError,
    get_storage,
    resolve_flyer_url,
)
from ..schemas import (
    AdminCreate,
    AdminOut,
    AdminPasswordSet,
    AdminSelfPasswordUpdate,
    AdminUpdate,
    AuditLogOut,
    AuditLogPage,
    CheckedInSeatsUpdate,
    CheckInRequest,
    DashboardCharts,
    DashboardSummary,
    EventAdminOut,
    EventCreate,
    EventReadiness,
    EventUpdate,
    GuestManifest,
    InviteTreeCreate,
    InviteTreeOut,
    InviteTreeUpdate,
    LoginRequest,
    ManifestEntry,
    ManifestTreeTotal,
    NotifyResult,
    ReadinessItem,
    RsvpAdminOut,
    RsvpUpdate,
    SeatUsagePoint,
    StatusBreakdownPoint,
    TokenResponse,
    TrendPoint,
)
from ..security import create_access_token, hash_password, verify_password
from ..seat_logic import computed_status, remaining_seats, used_seats
from ..urls import invite_url as build_invite_url

router = APIRouter(prefix="/api/admin", tags=["admin"])

logger = logging.getLogger("gatherarc.admin")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Throttle brute-force: block this IP+email after too many recent failures.
    check_login_not_blocked(request, payload.email)

    admin = db.execute(
        select(Admin).where(Admin.email == payload.email.lower())
    ).scalar_one_or_none()
    if admin is None or not verify_password(payload.password, admin.hashed_password):
        record_login_failure(request, payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not admin.is_active:
        record_login_failure(request, payload.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact an owner.",
        )
    # Successful sign-in clears the failure counter for this IP+email.
    reset_login_failures(request, payload.email)
    admin.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(admin)
    # Role is intentionally NOT baked into the token — it is looked up fresh on
    # every request, so role/active changes take effect immediately.
    token = create_access_token(admin.id, {"email": admin.email})
    return TokenResponse(access_token=token, admin=AdminOut.model_validate(admin))


@router.get("/me", response_model=AdminOut)
def me(admin: Admin = Depends(get_current_admin)):
    return AdminOut.model_validate(admin)


@router.patch("/me/password", status_code=204)
def change_my_password(
    payload: AdminSelfPasswordUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """Any logged-in admin can change their own password."""
    if not verify_password(payload.current_password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect.",
        )
    admin.hashed_password = hash_password(payload.new_password)
    log_action(db, admin, "admin_password_changed", "admin", admin.id, {})
    db.commit()


# --------------------------------------------------------------------------- #
# Admin management (owner only)
# --------------------------------------------------------------------------- #
def _active_owner_count(db: Session, exclude_id: str | None = None) -> int:
    stmt = select(func.count(Admin.id)).where(
        Admin.role == OWNER, Admin.is_active.is_(True)
    )
    if exclude_id is not None:
        stmt = stmt.where(Admin.id != exclude_id)
    return int(db.execute(stmt).scalar_one())


def _ensure_not_last_owner(db: Session, target: Admin) -> None:
    """Refuse an action that would leave zero active owners."""
    if _active_owner_count(db, exclude_id=target.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There must be at least one active owner.",
        )


def _get_admin_or_404(db: Session, admin_id: str) -> Admin:
    target = db.get(Admin, admin_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Admin not found.")
    return target


@router.get("/admins", response_model=list[AdminOut])
def list_admins(
    db: Session = Depends(get_db), admin: Admin = Depends(require_owner)
):
    admins = db.execute(select(Admin).order_by(Admin.created_at)).scalars().all()
    return [AdminOut.model_validate(a) for a in admins]


@router.post("/admins", response_model=AdminOut, status_code=201)
def create_admin(
    payload: AdminCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    email = payload.email.lower()
    if db.execute(select(Admin).where(Admin.email == email)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An admin with that email already exists.",
        )
    new_admin = Admin(
        email=email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        hashed_password=hash_password(payload.password),
        is_active=True,
    )
    db.add(new_admin)
    db.flush()
    log_action(
        db, admin, "admin_created", "admin", new_admin.id,
        {"email": email, "role": payload.role},
    )
    db.commit()
    db.refresh(new_admin)
    return AdminOut.model_validate(new_admin)


@router.patch("/admins/{admin_id}", response_model=AdminOut)
def update_admin(
    admin_id: str,
    payload: AdminUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    target = _get_admin_or_404(db, admin_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("full_name") is not None:
        target.full_name = data["full_name"].strip()

    if data.get("role") is not None and data["role"] != target.role:
        if target.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role.",
            )
        # Demoting the last active owner would lock everyone out of admin mgmt.
        if target.role == OWNER:
            _ensure_not_last_owner(db, target)
        old_role = target.role
        target.role = data["role"]
        log_action(
            db, admin, "admin_role_changed", "admin", target.id,
            {"from": old_role, "to": target.role},
        )

    db.commit()
    db.refresh(target)
    return AdminOut.model_validate(target)


@router.patch("/admins/{admin_id}/password", status_code=204)
def set_admin_password(
    admin_id: str,
    payload: AdminPasswordSet,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    target = _get_admin_or_404(db, admin_id)
    target.hashed_password = hash_password(payload.password)
    log_action(db, admin, "admin_password_reset", "admin", target.id, {})
    db.commit()


@router.patch("/admins/{admin_id}/deactivate", response_model=AdminOut)
def deactivate_admin(
    admin_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    target = _get_admin_or_404(db, admin_id)
    if target.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )
    if target.is_active:
        if target.role == OWNER:
            _ensure_not_last_owner(db, target)
        target.is_active = False
        log_action(db, admin, "admin_deactivated", "admin", target.id, {})
        db.commit()
        db.refresh(target)
    return AdminOut.model_validate(target)


@router.patch("/admins/{admin_id}/reactivate", response_model=AdminOut)
def reactivate_admin(
    admin_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    target = _get_admin_or_404(db, admin_id)
    if not target.is_active:
        target.is_active = True
        log_action(db, admin, "admin_reactivated", "admin", target.id, {})
        db.commit()
        db.refresh(target)
    return AdminOut.model_validate(target)


# --------------------------------------------------------------------------- #
# Audit log (owner only)
# --------------------------------------------------------------------------- #
# Metadata keys whose values are redacted before returning, as defence in depth —
# the app never logs secrets, but this guarantees it even if that ever slips.
_SENSITIVE_META_KEYS = ("password", "secret", "token", "hash", "apikey", "key")


def _safe_meta(raw: str) -> dict:
    try:
        data = json.loads(raw or "{}")
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, dict):
        return {"value": str(data)}
    safe: dict = {}
    for key, value in data.items():
        if any(s in str(key).lower() for s in _SENSITIVE_META_KEYS):
            safe[key] = "***"
        else:
            safe[key] = value
    return safe


@router.get("/audit-logs", response_model=AuditLogPage)
def list_audit_logs(
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
    action: str | None = None,
    admin_id: str | None = None,
    entity_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    if admin_id:
        conditions.append(AuditLog.admin_id == admin_id)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if since:
        conditions.append(AuditLog.created_at >= since)
    if until:
        conditions.append(AuditLog.created_at <= until)

    total = int(
        db.execute(select(func.count(AuditLog.id)).where(*conditions)).scalar_one()
    )
    rows = (
        db.execute(
            select(AuditLog)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )

    # Resolve admin display info in one query.
    ids = {r.admin_id for r in rows if r.admin_id}
    admins: dict[str, Admin] = {}
    if ids:
        for a in db.execute(select(Admin).where(Admin.id.in_(ids))).scalars().all():
            admins[a.id] = a

    items = [
        AuditLogOut(
            id=r.id,
            created_at=r.created_at,
            admin_id=r.admin_id,
            admin_email=admins[r.admin_id].email if r.admin_id in admins else None,
            admin_name=admins[r.admin_id].full_name if r.admin_id in admins else None,
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            meta=_safe_meta(r.meta),
        )
        for r in rows
    ]
    return AuditLogPage(items=items, total=total)


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
    # Confirmed seats = seats held by accepted RSVPs (matches dashboard usage).
    confirmed_seats = int(
        db.execute(
            select(func.coalesce(func.sum(Rsvp.seats_requested), 0)).where(
                Rsvp.event_id == event.id, Rsvp.rsvp_status == "accepted"
            )
        ).scalar_one()
    )
    out = EventAdminOut.model_validate(event)
    out.tree_count = tree_count
    out.rsvp_count = rsvp_count
    out.confirmed_seats = confirmed_seats
    out.flyer_image_url = resolve_flyer_url(event.flyer_storage_path, event.flyer_url)
    # Event-level availability (draft/closed/archived/deadline) — per-tree pauses
    # are reported per tree, so evaluate without a specific tree here.
    availability = evaluate_availability(event)
    out.accepting_rsvps = availability.accepting
    out.availability_reason = availability.reason
    out.availability_label = availability.label
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
    admin: Admin = Depends(require_editor),
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
    admin: Admin = Depends(require_editor),
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
# Safe, actionable admin-facing messages per sanitized storage-failure category.
# These never contain secrets, env-var values or raw provider responses.
_STORAGE_ERROR_MESSAGES: dict[str, str] = {
    BUCKET_NOT_FOUND: (
        "The configured flyer storage bucket was not found. Please check the "
        "Storage bucket name in the backend configuration."
    ),
    STORAGE_AUTH_FAILED: (
        "Flyer storage is not configured correctly (the storage provider "
        "rejected the credentials)."
    ),
    STORAGE_PERMISSION_DENIED: (
        "Flyer storage is not configured correctly (the storage provider "
        "denied permission for this bucket)."
    ),
    STORAGE_TIMEOUT: (
        "The storage provider did not respond in time. Please try again."
    ),
}
_STORAGE_ERROR_FALLBACK = "The storage provider rejected this upload. Please try again."


def _raise_storage_http(err: StorageError, operation: str, event_id: str) -> None:
    """Log a safe, structured diagnostic and raise a sanitized 502.

    Logs ONLY non-sensitive fields (operation, event id, backend, bucket, HTTP
    status, sanitized category, correlation id) — never the service-role key,
    auth header, raw provider body or image bytes.
    """
    correlation_id = new_uuid()[:8]
    logger.warning(
        "flyer_storage_failure operation=%s event_id=%s backend=%s bucket=%s "
        "http_status=%s category=%s correlation_id=%s",
        operation,
        event_id,
        settings.storage_backend,
        settings.supabase_storage_bucket if settings.is_supabase_storage else "local",
        err.status_code if err.status_code is not None else "n/a",
        err.category,
        correlation_id,
    )
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=_STORAGE_ERROR_MESSAGES.get(err.category, _STORAGE_ERROR_FALLBACK),
    )


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
    admin: Admin = Depends(require_editor),
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
    except StorageError as err:
        # The previous flyer (if any) is untouched — we only repoint the event
        # after a successful save, so a storage failure never erases a valid flyer.
        _raise_storage_http(err, "upload", event_id)

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
    admin: Admin = Depends(require_editor),
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
    # Per-tree availability: the event status/deadline plus this tree's pause.
    availability = evaluate_availability(tree.event, tree)
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
        invite_url=build_invite_url(tree.token),
        accepting_rsvps=availability.accepting,
        availability_reason=availability.reason,
        availability_label=availability.label,
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
    admin: Admin = Depends(require_editor),
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
    admin: Admin = Depends(require_editor),
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
def _admin_name_map(db: Session, rsvps: list[Rsvp]) -> dict[str, str]:
    """Map checked_in_by_admin_id -> display name for a batch of RSVPs."""
    ids = {r.checked_in_by_admin_id for r in rsvps if r.checked_in_by_admin_id}
    if not ids:
        return {}
    rows = db.execute(select(Admin).where(Admin.id.in_(ids))).scalars().all()
    return {a.id: (a.full_name or a.email) for a in rows}


def _serialize_rsvp(
    rsvp: Rsvp, admin_names: dict[str, str] | None = None
) -> RsvpAdminOut:
    checked_in_by = None
    if rsvp.checked_in_by_admin_id and admin_names:
        checked_in_by = admin_names.get(rsvp.checked_in_by_admin_id)
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
        email_opt_in=rsvp.email_opt_in,
        confirmation_sent_at=rsvp.confirmation_sent_at,
        reminder_sent_at=rsvp.reminder_sent_at,
        status_email_sent_at=rsvp.status_email_sent_at,
        check_in_email_sent_at=rsvp.check_in_email_sent_at,
        checked_in_at=rsvp.checked_in_at,
        checked_in_seats=rsvp.checked_in_seats,
        checked_in_by_admin_id=rsvp.checked_in_by_admin_id,
        checked_in_by=checked_in_by,
        check_in_token=rsvp.check_in_token,
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
    names = _admin_name_map(db, rsvps)
    return [_serialize_rsvp(r, names) for r in rsvps]


@router.patch("/rsvps/{rsvp_id}", response_model=RsvpAdminOut)
def update_rsvp(
    rsvp_id: str,
    payload: RsvpUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
    notify: bool = Query(False, description="Email the guest about the change."),
):
    rsvp = db.get(Rsvp, rsvp_id)
    if rsvp is None:
        raise HTTPException(status_code=404, detail="RSVP not found.")

    old_status = rsvp.rsvp_status
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

    # --- Email side effects (best-effort; never affect this response) --------
    try:
        event = rsvp.event
        # Optional guest notification when the STATUS actually changed.
        email_service.send_rsvp_status_update(
            db, rsvp, event, old_status, notify=notify
        )
        # Accepting a guest can fill a tree — alert the host once if so.
        if old_status != new_status and new_status == "accepted":
            email_service.maybe_alert_tree_exhausted(db, rsvp.invite_tree, event)
    except Exception:  # pragma: no cover - defensive
        pass

    return _serialize_rsvp(rsvp, _admin_name_map(db, [rsvp]))


# --------------------------------------------------------------------------- #
# Event-day check-in (scoped to an event)
# --------------------------------------------------------------------------- #
def _get_rsvp_or_404(db: Session, rsvp_id: str) -> Rsvp:
    rsvp = db.get(Rsvp, rsvp_id)
    if rsvp is None:
        raise HTTPException(status_code=404, detail="RSVP not found.")
    return rsvp


@router.get("/check-in/search", response_model=list[RsvpAdminOut])
def check_in_search(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    q: str | None = None,
    token: str | None = None,
):
    """Find guests for event-day check-in. Any active admin may view (viewers
    included); performing a check-in requires an editor role."""
    _get_event_or_404(db, event_id)
    stmt = (
        select(Rsvp)
        .join(InviteTree, Rsvp.invite_tree_id == InviteTree.id)
        .where(Rsvp.event_id == event_id)
    )
    if token:
        stmt = stmt.where(Rsvp.check_in_token == token)
    elif q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            (Rsvp.full_name.ilike(like))
            | (Rsvp.phone.ilike(like))
            | (Rsvp.email.ilike(like))
        )
    else:
        # No query: show the accepted roster (the guests actually expected).
        stmt = stmt.where(Rsvp.rsvp_status == "accepted")
    rsvps = db.execute(stmt.order_by(Rsvp.full_name).limit(200)).scalars().all()
    names = _admin_name_map(db, rsvps)
    return [_serialize_rsvp(r, names) for r in rsvps]


@router.post("/rsvps/{rsvp_id}/check-in", response_model=RsvpAdminOut)
def check_in_rsvp(
    rsvp_id: str,
    payload: CheckInRequest,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
):
    rsvp = _get_rsvp_or_404(db, rsvp_id)
    if rsvp.rsvp_status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only accepted guests can be checked in. Update the RSVP status "
                "to accepted first."
            ),
        )
    if rsvp.checked_in_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This guest is already checked in.",
        )
    seats = payload.seats if payload.seats is not None else rsvp.seats_requested
    if seats < 1 or seats > rsvp.seats_requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Checked-in seats must be between 1 and the {rsvp.seats_requested} "
                "seats this guest reserved."
            ),
        )
    # Race-safe claim: flip checked_in_at from NULL in a single guarded UPDATE.
    # The ``checked_in_at IS NULL`` predicate makes the check-and-set atomic at
    # the database level (portable across SQLite and PostgreSQL), so if two
    # admins tap "check in" at the same instant only the first UPDATE matches a
    # row — the second matches zero and gets a friendly 409 instead of silently
    # overwriting who/when/how-many-seats.
    result = db.execute(
        update(Rsvp)
        .where(Rsvp.id == rsvp.id, Rsvp.checked_in_at.is_(None))
        .values(
            checked_in_at=datetime.utcnow(),
            checked_in_by_admin_id=admin.id,
            checked_in_seats=seats,
        )
    )
    if result.rowcount == 0:
        # Another request won the race between our read above and this write.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This guest is already checked in.",
        )
    log_action(db, admin, "rsvp_checked_in", "rsvp", rsvp.id, {"seats": seats})
    db.commit()
    db.refresh(rsvp)

    # Optional 'you're checked in' acknowledgement — never blocks check-in.
    try:
        email_service.send_check_in_acknowledgement(db, rsvp, rsvp.event)
    except Exception:  # pragma: no cover - defensive
        pass

    return _serialize_rsvp(rsvp, _admin_name_map(db, [rsvp]))


@router.post("/rsvps/{rsvp_id}/undo-check-in", response_model=RsvpAdminOut)
def undo_check_in(
    rsvp_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
):
    rsvp = _get_rsvp_or_404(db, rsvp_id)
    if rsvp.checked_in_at is not None:
        rsvp.checked_in_at = None
        rsvp.checked_in_by_admin_id = None
        rsvp.checked_in_seats = None
        log_action(db, admin, "rsvp_check_in_undone", "rsvp", rsvp.id, {})
        db.commit()
        db.refresh(rsvp)
    return _serialize_rsvp(rsvp, _admin_name_map(db, [rsvp]))


@router.patch("/rsvps/{rsvp_id}/checked-in-seats", response_model=RsvpAdminOut)
def adjust_checked_in_seats(
    rsvp_id: str,
    payload: CheckedInSeatsUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
):
    rsvp = _get_rsvp_or_404(db, rsvp_id)
    if rsvp.checked_in_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This guest is not checked in yet.",
        )
    if payload.checked_in_seats > rsvp.seats_requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Checked-in seats cannot exceed the {rsvp.seats_requested} seats "
                "this guest reserved."
            ),
        )
    rsvp.checked_in_seats = payload.checked_in_seats
    log_action(
        db, admin, "rsvp_checked_in_seats_adjusted", "rsvp", rsvp.id,
        {"seats": payload.checked_in_seats},
    )
    db.commit()
    db.refresh(rsvp)
    return _serialize_rsvp(rsvp, _admin_name_map(db, [rsvp]))


@router.post("/rsvps/{rsvp_id}/resend-confirmation", response_model=NotifyResult)
def resend_confirmation(
    rsvp_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
):
    """Re-send the RSVP confirmation to a guest who has email + consent."""
    rsvp = _get_rsvp_or_404(db, rsvp_id)
    if not rsvp.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This guest has no email address on file.",
        )
    if not rsvp.email_opt_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This guest has not opted in to email updates.",
        )
    log = email_service.send_rsvp_confirmation(db, rsvp, rsvp.event)
    log_action(db, admin, "rsvp_confirmation_resent", "rsvp", rsvp.id, {})
    db.commit()
    if log is None:
        return NotifyResult(status="not_attempted", detail="Nothing was sent.")
    detail = {
        "sent": "Confirmation email sent.",
        "failed": "The email provider could not send right now.",
        "skipped": "Skipped — the guest is not eligible.",
    }.get(log.status, "Recorded.")
    return NotifyResult(status=log.status, detail=detail)


# --------------------------------------------------------------------------- #
# Guest manifest (scoped to an event)
# --------------------------------------------------------------------------- #
@router.get("/guest-manifest", response_model=GuestManifest)
def guest_manifest(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)
    rsvps = (
        db.execute(
            select(Rsvp)
            .join(InviteTree, Rsvp.invite_tree_id == InviteTree.id)
            .where(Rsvp.event_id == event_id)
            .order_by(InviteTree.name, Rsvp.full_name)
        )
        .scalars()
        .all()
    )

    entries: list[ManifestEntry] = []
    total_confirmed = total_checked = total_pending = 0
    tree_totals: dict[str, dict] = {}

    for r in rsvps:
        checked = r.checked_in_at is not None
        tree_name = r.invite_tree.name if r.invite_tree else ""
        entries.append(
            ManifestEntry(
                id=r.id,
                full_name=r.full_name,
                phone=r.phone,
                email=r.email,
                invite_tree_id=r.invite_tree_id,
                invite_tree_name=tree_name,
                rsvp_status=r.rsvp_status,
                seats_requested=r.seats_requested,
                checked_in=checked,
                checked_in_at=r.checked_in_at,
                checked_in_seats=r.checked_in_seats,
                note_to_celebrant=r.note_to_celebrant,
                dietary_note=r.dietary_note,
            )
        )
        tt = tree_totals.setdefault(
            r.invite_tree_id,
            {"name": tree_name, "guests": 0, "confirmed": 0, "checked": 0},
        )
        if r.rsvp_status == "accepted":
            total_confirmed += r.seats_requested
            tt["confirmed"] += r.seats_requested
            tt["guests"] += 1
        elif r.rsvp_status == "waitlisted":
            total_pending += r.seats_requested
        if checked:
            total_checked += r.checked_in_seats or 0
            tt["checked"] += r.checked_in_seats or 0

    return GuestManifest(
        event_id=event.id,
        event_name=event.name,
        entries=entries,
        total_confirmed_seats=total_confirmed,
        total_checked_in_seats=total_checked,
        total_pending_seats=total_pending,
        tree_totals=[
            ManifestTreeTotal(
                invite_tree_id=tid,
                invite_tree_name=v["name"],
                guests=v["guests"],
                confirmed_seats=v["confirmed"],
                checked_in_seats=v["checked"],
            )
            for tid, v in tree_totals.items()
        ],
    )


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
            "Checked In",
            "Checked-in Seats",
            "Checked In At",
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
                "yes" if r.checked_in_at else "no",
                r.checked_in_seats if r.checked_in_at else "",
                r.checked_in_at.isoformat() if r.checked_in_at else "",
                (r.note_to_celebrant or "").replace("\n", " "),
                (r.dietary_note or "").replace("\n", " "),
                r.created_at.isoformat(),
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gatherarc-guests.csv"},
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

    # Event-day check-in metrics.
    checked_in_rsvps = int(
        db.execute(
            select(func.count(Rsvp.id)).where(
                Rsvp.event_id == event_id, Rsvp.checked_in_at.is_not(None)
            )
        ).scalar_one()
    )
    checked_in_seats = int(
        db.execute(
            select(func.coalesce(func.sum(Rsvp.checked_in_seats), 0)).where(
                Rsvp.event_id == event_id, Rsvp.checked_in_at.is_not(None)
            )
        ).scalar_one()
    )
    accepted = status_counts.get("accepted", 0)

    return DashboardSummary(
        total_allocated_seats=total_allocated,
        total_confirmed_seats=confirmed_seats,
        remaining_seats=max(total_allocated - confirmed_seats, 0),
        total_rsvps=total_rsvps,
        accepted_rsvps=accepted,
        declined_rsvps=status_counts.get("declined", 0),
        waitlisted_rsvps=status_counts.get("waitlisted", 0),
        cancelled_rsvps=status_counts.get("cancelled", 0),
        exhausted_trees=exhausted,
        total_trees=len(trees),
        checked_in_rsvps=checked_in_rsvps,
        checked_in_seats=checked_in_seats,
        confirmed_not_checked_in=max(accepted - checked_in_rsvps, 0),
        check_in_rate=round(checked_in_rsvps / accepted, 4) if accepted else 0.0,
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
