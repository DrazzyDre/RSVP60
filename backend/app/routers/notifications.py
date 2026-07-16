"""Admin notification-centre endpoints (Phase 7).

Any active admin — owner, admin or viewer — may read notifications and mark
their visible notifications as read (notifications are informational, not a
privileged mutation). Unauthenticated callers are rejected by the auth
dependency.

Event scoping: an ``event_id`` filter returns that event's notifications and,
by default, platform-level ones (``event_id IS NULL``: admin/security signals
that aren't tied to a single event). Read state is a single global flag — see
the Phase 7 docs for the tradeoff.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import notifications as notif_service
from ..database import get_db
from ..deps import get_current_admin
from ..models import Admin, AdminNotification, Event
from ..schemas import (
    MarkAllReadResult,
    NotificationOut,
    NotificationPage,
    UnreadCount,
)

router = APIRouter(prefix="/api/admin/notifications", tags=["notifications"])


def _scope_conditions(event_id: str | None, include_platform: bool) -> list:
    """WHERE conditions applying the event / platform visibility scope."""
    if event_id is None:
        return []
    if include_platform:
        return [
            or_(
                AdminNotification.event_id == event_id,
                AdminNotification.event_id.is_(None),
            )
        ]
    return [AdminNotification.event_id == event_id]


def _event_name_map(db: Session, rows: list[AdminNotification]) -> dict[str, str]:
    ids = {r.event_id for r in rows if r.event_id}
    if not ids:
        return {}
    result = db.execute(
        select(Event.id, Event.name).where(Event.id.in_(ids))
    ).all()
    return {eid: name for eid, name in result}


def _serialize(row: AdminNotification, names: dict[str, str]) -> NotificationOut:
    out = NotificationOut.model_validate(row)
    out.event_name = names.get(row.event_id) if row.event_id else None
    return out


@router.get("", response_model=NotificationPage)
def list_notifications(
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    event_id: str | None = None,
    include_platform: bool = Query(True),
    unread: bool = Query(False, description="Only unread notifications."),
    severity: str | None = None,
    notification_type: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    scope = _scope_conditions(event_id, include_platform)

    conditions = list(scope)
    if unread:
        conditions.append(AdminNotification.is_read.is_(False))
    if severity:
        conditions.append(AdminNotification.severity == severity)
    if notification_type:
        conditions.append(AdminNotification.notification_type == notification_type)

    total = int(
        db.execute(
            select(func.count(AdminNotification.id)).where(*conditions)
        ).scalar_one()
    )
    rows = (
        db.execute(
            select(AdminNotification)
            .where(*conditions)
            .order_by(AdminNotification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    # Unread count reflects the SCOPE (not the current filters/pagination), so a
    # badge stays accurate while the admin filters the list.
    unread_total = notif_service.unread_count(
        db, event_id=event_id, include_platform=include_platform
    )
    names = _event_name_map(db, rows)
    return NotificationPage(
        items=[_serialize(r, names) for r in rows],
        total=total,
        unread=unread_total,
    )


@router.get("/unread-count", response_model=UnreadCount)
def notifications_unread_count(
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    event_id: str | None = None,
    include_platform: bool = Query(True),
):
    return UnreadCount(
        unread=notif_service.unread_count(
            db, event_id=event_id, include_platform=include_platform
        )
    )


@router.patch("/read-all", response_model=MarkAllReadResult)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    event_id: str | None = None,
    include_platform: bool = Query(True),
):
    updated = notif_service.mark_all_read(
        db, event_id=event_id, include_platform=include_platform
    )
    return MarkAllReadResult(updated=updated)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    note = db.get(AdminNotification, notification_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    note = notif_service.mark_read(db, note)
    names = _event_name_map(db, [note])
    return _serialize(note, names)
