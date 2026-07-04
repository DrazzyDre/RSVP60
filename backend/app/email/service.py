"""High-level guest-communication operations.

Routers call these functions; they never touch a provider directly. Every
function here treats delivery as a best-effort side effect:

* consent and "already sent" are checked before sending;
* a :class:`CommunicationLog` row records every attempt (or deliberate skip);
* nothing raises to the caller — a provider or DB hiccup can never roll back
  an RSVP, a check-in or an admin status change.
"""

import json
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CommunicationLog, Rsvp
from . import templates
from .base import EmailMessage
from .providers import get_provider

logger = logging.getLogger("gatherarc.email")

_SENSITIVE_META_KEYS = ("password", "secret", "token", "hash", "apikey", "key")


def _safe_meta(meta: dict | None) -> str:
    if not meta:
        return "{}"
    safe = {}
    for k, v in meta.items():
        if any(s in str(k).lower() for s in _SENSITIVE_META_KEYS):
            safe[k] = "***"
        else:
            safe[k] = v
    try:
        return json.dumps(safe)
    except (TypeError, ValueError):
        return "{}"


def _sanitize_error(summary: str | None) -> str | None:
    if not summary:
        return None
    # Our own summaries never contain secrets; truncate defensively regardless.
    return summary[:480]


def can_email_guest(rsvp: Rsvp) -> bool:
    """A guest may be emailed only with an address AND explicit consent."""
    return bool(getattr(rsvp, "email", None) and getattr(rsvp, "email_opt_in", False))


def _record(
    db: Session,
    *,
    event_id: str,
    comm_type: str,
    recipient: str,
    status: str,
    rsvp_id: str | None = None,
    invite_tree_id: str | None = None,
    provider: str = "",
    provider_message_id: str | None = None,
    error_summary: str | None = None,
    sent_at: datetime | None = None,
    meta: dict | None = None,
) -> CommunicationLog:
    log = CommunicationLog(
        event_id=event_id,
        rsvp_id=rsvp_id,
        invite_tree_id=invite_tree_id,
        communication_type=comm_type,
        channel="email",
        recipient=recipient or "",
        provider=provider,
        status=status,
        provider_message_id=provider_message_id,
        error_summary=_sanitize_error(error_summary),
        sent_at=sent_at,
        meta=_safe_meta(meta),
    )
    db.add(log)
    return log


def _deliver(
    db: Session,
    *,
    event_id: str,
    comm_type: str,
    recipient: str,
    subject: str,
    html: str,
    text: str,
    rsvp_id: str | None = None,
    invite_tree_id: str | None = None,
    meta: dict | None = None,
) -> CommunicationLog:
    """Send one message and record the outcome. Never raises."""
    provider = get_provider()
    try:
        result = provider.send(
            EmailMessage(to=recipient, subject=subject, html=html, text=text)
        )
    except Exception:  # pragma: no cover - ultra-defensive
        logger.exception("Email provider crashed while sending %s", comm_type)
        return _record(
            db,
            event_id=event_id,
            comm_type=comm_type,
            recipient=recipient,
            status="failed",
            rsvp_id=rsvp_id,
            invite_tree_id=invite_tree_id,
            provider=provider.name,
            error_summary="Unexpected send error.",
            meta=meta,
        )
    return _record(
        db,
        event_id=event_id,
        comm_type=comm_type,
        recipient=recipient,
        status=result.status,
        rsvp_id=rsvp_id,
        invite_tree_id=invite_tree_id,
        provider=result.provider,
        provider_message_id=result.provider_message_id,
        error_summary=result.error_summary,
        sent_at=datetime.utcnow() if result.ok else None,
        meta=meta,
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to persist communication log")
        db.rollback()


# --------------------------------------------------------------------------- #
# Guest transactional emails
# --------------------------------------------------------------------------- #
def send_rsvp_confirmation(db: Session, rsvp: Rsvp, event) -> CommunicationLog | None:
    """Confirmation after a guest submits/updates their RSVP.

    Reflects the ACTUAL outcome (accepted / waitlisted / declined) — a
    waitlisted guest is never told they are confirmed.
    """
    try:
        if not getattr(rsvp, "email", None):
            return None  # no address -> no attempt, nothing to record
        if not rsvp.email_opt_in:
            log = _record(
                db, event_id=event.id, comm_type="rsvp_confirmation",
                recipient=rsvp.email, status="skipped", rsvp_id=rsvp.id,
                meta={"reason": "no_consent"},
            )
            _commit(db)
            return log
        subject, html, text = templates.render_confirmation(event, rsvp)
        log = _deliver(
            db, event_id=event.id, comm_type="rsvp_confirmation",
            recipient=rsvp.email, subject=subject, html=html, text=text,
            rsvp_id=rsvp.id, meta={"status": rsvp.rsvp_status},
        )
        if log.status == "sent":
            rsvp.confirmation_sent_at = datetime.utcnow()
        _commit(db)
        return log
    except Exception:  # pragma: no cover - defensive
        logger.exception("send_rsvp_confirmation failed")
        db.rollback()
        return None


def send_rsvp_status_update(
    db: Session, rsvp: Rsvp, event, old_status: str, *, notify: bool = True
) -> CommunicationLog | None:
    """Optional email when an editor changes an RSVP's status."""
    try:
        if not notify:
            return None
        if old_status == rsvp.rsvp_status:
            return None  # unchanged -> never a duplicate email
        if not getattr(rsvp, "email", None):
            return None
        if not rsvp.email_opt_in:
            log = _record(
                db, event_id=event.id, comm_type="rsvp_status_update",
                recipient=rsvp.email, status="skipped", rsvp_id=rsvp.id,
                meta={"reason": "no_consent"},
            )
            _commit(db)
            return log
        subject, html, text = templates.render_status_update(event, rsvp, old_status)
        log = _deliver(
            db, event_id=event.id, comm_type="rsvp_status_update",
            recipient=rsvp.email, subject=subject, html=html, text=text,
            rsvp_id=rsvp.id, meta={"from": old_status, "to": rsvp.rsvp_status},
        )
        if log.status == "sent":
            rsvp.status_email_sent_at = datetime.utcnow()
        _commit(db)
        return log
    except Exception:  # pragma: no cover - defensive
        logger.exception("send_rsvp_status_update failed")
        db.rollback()
        return None


def send_check_in_acknowledgement(db: Session, rsvp: Rsvp, event) -> CommunicationLog | None:
    """Optional 'you're checked in' email. Never blocks check-in."""
    try:
        if not getattr(rsvp, "email", None) or not rsvp.email_opt_in:
            return None
        if rsvp.check_in_email_sent_at:
            return None  # already acknowledged
        subject, html, text = templates.render_check_in_ack(event, rsvp)
        log = _deliver(
            db, event_id=event.id, comm_type="check_in_acknowledgement",
            recipient=rsvp.email, subject=subject, html=html, text=text,
            rsvp_id=rsvp.id, meta={"seats": rsvp.checked_in_seats},
        )
        if log.status == "sent":
            rsvp.check_in_email_sent_at = datetime.utcnow()
        _commit(db)
        return log
    except Exception:  # pragma: no cover - defensive
        logger.exception("send_check_in_acknowledgement failed")
        db.rollback()
        return None


def send_event_reminder(db: Session, event, rsvps: list[Rsvp]) -> dict:
    """Send reminders to a pre-filtered list of eligible guests.

    Returns a {sent, failed, skipped} summary. Each guest gets one log row and
    (on success) a reminder_sent_at timestamp.
    """
    summary = {"sent": 0, "failed": 0, "skipped": 0}
    for rsvp in rsvps:
        try:
            if not can_email_guest(rsvp):
                _record(
                    db, event_id=event.id, comm_type="event_reminder",
                    recipient=getattr(rsvp, "email", "") or "", status="skipped",
                    rsvp_id=rsvp.id, meta={"reason": "not_eligible"},
                )
                summary["skipped"] += 1
                continue
            subject, html, text = templates.render_reminder(event, rsvp)
            log = _deliver(
                db, event_id=event.id, comm_type="event_reminder",
                recipient=rsvp.email, subject=subject, html=html, text=text,
                rsvp_id=rsvp.id,
            )
            if log.status == "sent":
                rsvp.reminder_sent_at = datetime.utcnow()
                summary["sent"] += 1
            else:
                summary["failed"] += 1
        except Exception:  # pragma: no cover - defensive
            logger.exception("reminder send failed for one guest")
            summary["failed"] += 1
    _commit(db)
    return summary


# --------------------------------------------------------------------------- #
# Host alerts (internal)
# --------------------------------------------------------------------------- #
def _host_alert_already_sent(
    db: Session,
    event_id: str,
    comm_type: str,
    *,
    invite_tree_id: str | None = None,
    rsvp_id: str | None = None,
) -> bool:
    stmt = select(CommunicationLog.id).where(
        CommunicationLog.event_id == event_id,
        CommunicationLog.communication_type == comm_type,
        CommunicationLog.status.in_(("sent", "pending")),
    )
    if invite_tree_id is not None:
        stmt = stmt.where(CommunicationLog.invite_tree_id == invite_tree_id)
    if rsvp_id is not None:
        stmt = stmt.where(CommunicationLog.rsvp_id == rsvp_id)
    return db.execute(stmt.limit(1)).first() is not None


def send_host_alert(
    db: Session,
    event,
    alert_type: str,
    context: dict,
    *,
    invite_tree_id: str | None = None,
    rsvp_id: str | None = None,
    dedup: bool = True,
) -> CommunicationLog | None:
    """Send a host/admin alert, respecting per-event toggles and de-duplication."""
    try:
        recipient = (getattr(event, "host_notification_email", "") or "").strip()
        if not recipient:
            return None
        if alert_type == "host_tree_exhausted" and not event.notify_tree_exhausted:
            return None
        if alert_type == "host_waitlisted_rsvp" and not event.notify_waitlisted_rsvp:
            return None
        if dedup and _host_alert_already_sent(
            db, event.id, alert_type, invite_tree_id=invite_tree_id, rsvp_id=rsvp_id
        ):
            return None
        subject, html, text = templates.render_host_alert(event, alert_type, context)
        log = _deliver(
            db, event_id=event.id, comm_type=alert_type, recipient=recipient,
            subject=subject, html=html, text=text,
            rsvp_id=rsvp_id, invite_tree_id=invite_tree_id,
            meta={"alert": alert_type},
        )
        _commit(db)
        return log
    except Exception:  # pragma: no cover - defensive
        logger.exception("send_host_alert failed")
        db.rollback()
        return None


def maybe_alert_tree_exhausted(db: Session, tree, event) -> None:
    """Fire a one-time host alert when a tree has just filled up."""
    try:
        from ..seat_logic import remaining_seats

        if tree.allocated_seats <= 0:
            return
        if remaining_seats(db, tree) > 0:
            return
        send_host_alert(
            db, event, "host_tree_exhausted",
            {"tree_name": tree.name, "allocated": tree.allocated_seats},
            invite_tree_id=tree.id,
        )
    except Exception:  # pragma: no cover - defensive
        logger.exception("maybe_alert_tree_exhausted failed")
        db.rollback()
