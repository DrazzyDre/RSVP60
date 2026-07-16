"""In-app admin notification centre (Phase 7 observability).

A thin service layer over :class:`~app.models.AdminNotification`. Every flow that
wants to raise an operational signal calls one of the helpers here rather than
inserting rows ad hoc, so creation stays consistent, sanitized and — crucially —
*best-effort*: a notification failure must never break the operation that
triggered it (an RSVP, an email send, a flyer upload, an admin change).

Security: ``meta`` is scrubbed of anything that looks like a secret and is kept
deliberately small. Titles/messages are written by callers and must never embed
API keys, tokens, raw provider responses or sensitive guest notes.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import AdminNotification

logger = logging.getLogger("gatherarc.notifications")

# Severity levels (kept in sync with the frontend).
INFO = "info"
SUCCESS = "success"
WARNING = "warning"
ERROR = "error"
SEVERITIES = (INFO, SUCCESS, WARNING, ERROR)

_SENSITIVE_META_KEYS = ("password", "secret", "token", "hash", "apikey", "key", "authorization")


def _safe_meta(meta: dict | None) -> str:
    """Serialize notification metadata, redacting anything secret-looking."""
    if not meta:
        return "{}"
    safe: dict = {}
    for k, v in meta.items():
        if any(s in str(k).lower() for s in _SENSITIVE_META_KEYS):
            safe[k] = "***"
        else:
            safe[k] = v
    try:
        return json.dumps(safe)
    except (TypeError, ValueError):
        return "{}"


def _commit(db: Session) -> bool:
    try:
        db.commit()
        return True
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to persist admin notification")
        db.rollback()
        return False


def create_notification(
    db: Session,
    *,
    notification_type: str,
    title: str,
    message: str = "",
    severity: str = INFO,
    event_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action_url: str | None = None,
    dedupe_key: str | None = None,
    meta: dict | None = None,
    commit: bool = True,
) -> AdminNotification | None:
    """Create one admin notification. Best-effort — returns ``None`` on failure.

    When ``commit`` is True the row is persisted immediately (the default, so
    side-effect callers don't have to manage a transaction). Pass ``commit=False``
    to enlist it in the caller's open transaction instead.
    """
    try:
        if severity not in SEVERITIES:
            severity = INFO
        note = AdminNotification(
            event_id=event_id,
            notification_type=notification_type,
            severity=severity,
            title=title[:200],
            message=message or "",
            entity_type=entity_type,
            entity_id=entity_id,
            action_url=action_url,
            dedupe_key=dedupe_key,
            meta=_safe_meta(meta),
        )
        db.add(note)
        if commit and not _commit(db):
            return None
        return note
    except Exception:  # pragma: no cover - defensive; never break the caller
        logger.exception("create_notification failed (type=%s)", notification_type)
        try:
            db.rollback()
        except Exception:  # pragma: no cover - defensive
            pass
        return None


def create_event_notification(
    db: Session,
    event,
    *,
    notification_type: str,
    title: str,
    message: str = "",
    severity: str = INFO,
    **kwargs,
) -> AdminNotification | None:
    """Convenience wrapper that scopes a notification to an event."""
    event_id = getattr(event, "id", None) if event is not None else None
    return create_notification(
        db,
        notification_type=notification_type,
        title=title,
        message=message,
        severity=severity,
        event_id=event_id,
        **kwargs,
    )


def _unread_with_dedupe_exists(
    db: Session, dedupe_key: str, event_id: str | None
) -> bool:
    stmt = select(AdminNotification.id).where(
        AdminNotification.dedupe_key == dedupe_key,
        AdminNotification.is_read.is_(False),
    )
    if event_id is None:
        stmt = stmt.where(AdminNotification.event_id.is_(None))
    else:
        stmt = stmt.where(AdminNotification.event_id == event_id)
    return db.execute(stmt.limit(1)).first() is not None


def create_deduped_notification(
    db: Session,
    *,
    dedupe_key: str,
    notification_type: str,
    title: str,
    message: str = "",
    severity: str = INFO,
    event_id: str | None = None,
    **kwargs,
) -> AdminNotification | None:
    """Create a notification only if no UNREAD one shares ``dedupe_key``.

    This collapses noisy repeats of the same *live* condition (e.g. one "invite
    tree exhausted" per tree, one storage-config error per event) into a single
    unread item. Once an admin reads it, the condition can legitimately notify
    again. Returns ``None`` when suppressed as a duplicate.
    """
    try:
        if _unread_with_dedupe_exists(db, dedupe_key, event_id):
            return None
    except Exception:  # pragma: no cover - defensive
        logger.exception("dedupe lookup failed for key=%s", dedupe_key)
        # Fall through and try to create anyway — a missed dedupe is harmless.
    return create_notification(
        db,
        notification_type=notification_type,
        title=title,
        message=message,
        severity=severity,
        event_id=event_id,
        dedupe_key=dedupe_key,
        **kwargs,
    )


def mark_read(db: Session, note: AdminNotification) -> AdminNotification:
    if not note.is_read:
        note.is_read = True
        note.read_at = datetime.utcnow()
        db.commit()
        db.refresh(note)
    return note


def mark_all_read(
    db: Session, *, event_id: str | None = None, include_platform: bool = True
) -> int:
    """Mark unread notifications read. Returns how many were updated.

    With ``event_id`` set, marks that event's unread notifications (plus
    platform-level ones when ``include_platform``); with no ``event_id`` it marks
    every unread notification.
    """
    stmt = select(AdminNotification).where(AdminNotification.is_read.is_(False))
    if event_id is not None:
        if include_platform:
            stmt = stmt.where(
                (AdminNotification.event_id == event_id)
                | (AdminNotification.event_id.is_(None))
            )
        else:
            stmt = stmt.where(AdminNotification.event_id == event_id)
    rows = db.execute(stmt).scalars().all()
    now = datetime.utcnow()
    for row in rows:
        row.is_read = True
        row.read_at = now
    if rows:
        db.commit()
    return len(rows)


def unread_count(
    db: Session, *, event_id: str | None = None, include_platform: bool = True
) -> int:
    """Count unread notifications, optionally scoped to an event (+ platform)."""
    stmt = select(func.count(AdminNotification.id)).where(
        AdminNotification.is_read.is_(False)
    )
    if event_id is not None:
        if include_platform:
            stmt = stmt.where(
                (AdminNotification.event_id == event_id)
                | (AdminNotification.event_id.is_(None))
            )
        else:
            stmt = stmt.where(AdminNotification.event_id == event_id)
    return int(db.execute(stmt).scalar_one())


# --------------------------------------------------------------------------- #
# Domain helpers — the single place operational events become notifications.
#
# Every helper is best-effort (create_notification never raises). ``action_url``
# values are frontend-relative workspace paths the admin UI navigates to. None of
# these titles/messages embed secrets, tokens or sensitive guest notes.
# --------------------------------------------------------------------------- #
def _event_path(event_id: str | None, suffix: str = "") -> str | None:
    if not event_id:
        return None
    return f"/admin/e/{event_id}{suffix}"


def notify_new_rsvp(db: Session, event, rsvp, *, commit: bool = True):
    """A newly accepted guest RSVP (info). Waitlist has its own warning."""
    return create_event_notification(
        db, event,
        notification_type="rsvp_new",
        severity=INFO,
        title="New RSVP received",
        message=f"{rsvp.full_name} is attending ({rsvp.seats_requested} seat(s)).",
        entity_type="rsvp",
        entity_id=rsvp.id,
        action_url=_event_path(getattr(event, "id", None), "/rsvps"),
        meta={"seats": rsvp.seats_requested},
        commit=commit,
    )


def notify_waitlisted(db: Session, event, rsvp, *, commit: bool = True):
    """A guest was waitlisted because the invite allocation is full (warning)."""
    return create_event_notification(
        db, event,
        notification_type="rsvp_waitlisted",
        severity=WARNING,
        title="Guest waitlisted",
        message=(
            f"{rsvp.full_name} was waitlisted — the invite allocation is full. "
            "Free up seats or confirm them from the guest list."
        ),
        entity_type="rsvp",
        entity_id=rsvp.id,
        action_url=_event_path(getattr(event, "id", None), "/rsvps?status=waitlisted"),
        meta={"seats": rsvp.seats_requested},
        commit=commit,
    )


def maybe_notify_tree_exhausted(db: Session, tree, event, *, commit: bool = True):
    """One deduped warning when an invite tree has just filled up.

    Mirrors ``email.service.maybe_alert_tree_exhausted`` but for the in-app
    centre, and is independent of whether a host-alert email is configured.
    """
    try:
        from .seat_logic import remaining_seats

        if tree.allocated_seats <= 0:
            return None
        if remaining_seats(db, tree) > 0:
            return None
        return create_deduped_notification(
            db,
            dedupe_key=f"tree_exhausted:{tree.id}",
            notification_type="tree_exhausted",
            severity=WARNING,
            title="Invite tree full",
            message=(
                f"“{tree.name}” has no seats remaining "
                f"({tree.allocated_seats} allocated). New guests will be waitlisted."
            ),
            event_id=getattr(event, "id", None),
            entity_type="invite_tree",
            entity_id=tree.id,
            action_url=_event_path(getattr(event, "id", None), "/invite-trees"),
            commit=commit,
        )
    except Exception:  # pragma: no cover - defensive
        logger.exception("maybe_notify_tree_exhausted failed")
        return None


def notify_email_failed(
    db: Session, *, event_id: str, communication_type: str,
    error_summary: str | None = None, commit: bool = False,
):
    """A guest/host email delivery failed (error). Deduped per (event, type).

    Collapses a burst of failures of the same kind (e.g. a whole reminder run
    failing) into a single unread item pointing at the Communications page.
    """
    label = communication_type.replace("_", " ")
    return create_deduped_notification(
        db,
        dedupe_key=f"email_failed:{event_id}:{communication_type}",
        notification_type="email_failed",
        severity=ERROR,
        title="Email delivery failed",
        message=(
            (error_summary or "The email provider could not send right now.")
            + f" ({label}) — check email configuration on the Communications page."
        ),
        event_id=event_id,
        entity_type="communication",
        action_url=_event_path(event_id, "/communications"),
        meta={"communication_type": communication_type},
        commit=commit,
    )


def notify_reminder_complete(db: Session, event, summary: dict, *, commit: bool = True):
    """Outcome of a bulk reminder run (info, or warning when some failed)."""
    failed = int(summary.get("failed", 0) or 0)
    sent = int(summary.get("sent", 0) or 0)
    skipped = int(summary.get("skipped", 0) or 0)
    if failed:
        severity, title = WARNING, "Reminder send had failures"
    else:
        severity, title = SUCCESS, "Reminder send completed"
    return create_event_notification(
        db, event,
        notification_type="reminder_complete",
        severity=severity,
        title=title,
        message=f"Sent {sent}, failed {failed}, skipped {skipped}.",
        entity_type="communication",
        action_url=_event_path(getattr(event, "id", None), "/communications"),
        meta={"sent": sent, "failed": failed, "skipped": skipped},
        commit=commit,
    )


def notify_storage_failed(
    db: Session, *, event_id: str, category: str, operation: str = "upload",
    commit: bool = True,
):
    """A flyer/storage operation failed (error). Deduped per (event, category)."""
    return create_deduped_notification(
        db,
        dedupe_key=f"storage_failed:{event_id}:{category}",
        notification_type="storage_failed",
        severity=ERROR,
        title="Flyer upload failed",
        message=(
            "A flyer could not be saved to storage. Check the storage "
            "configuration in Event Settings and try again."
        ),
        event_id=event_id,
        entity_type="event",
        entity_id=event_id,
        action_url=_event_path(event_id, "/settings"),
        meta={"category": category, "operation": operation},
        commit=commit,
    )


def notify_duplicate_check_in(db: Session, event, rsvp, *, commit: bool = True):
    """A guest who is already checked in was scanned/checked again (warning)."""
    return create_deduped_notification(
        db,
        dedupe_key=f"duplicate_check_in:{rsvp.id}",
        notification_type="duplicate_check_in",
        severity=WARNING,
        title="Duplicate check-in attempted",
        message=f"{rsvp.full_name} is already checked in.",
        event_id=getattr(event, "id", None),
        entity_type="rsvp",
        entity_id=rsvp.id,
        action_url=_event_path(getattr(event, "id", None), "/check-in"),
        commit=commit,
    )


def notify_admin_deactivated(db: Session, target, *, by_admin=None, commit: bool = True):
    """Platform-level: an admin account was deactivated (warning)."""
    return create_notification(
        db,
        notification_type="admin_deactivated",
        severity=WARNING,
        title="Admin deactivated",
        message=(
            f"{target.full_name or target.email} ({target.role}) was deactivated."
        ),
        entity_type="admin",
        entity_id=target.id,
        action_url="/admin/admins",
        commit=commit,
    )


def notify_admin_created(db: Session, target, *, commit: bool = True):
    """Platform-level: a new admin account was created (info)."""
    return create_notification(
        db,
        notification_type="admin_created",
        severity=INFO,
        title="New admin added",
        message=f"{target.full_name or target.email} was added as {target.role}.",
        entity_type="admin",
        entity_id=target.id,
        action_url="/admin/admins",
        commit=commit,
    )
