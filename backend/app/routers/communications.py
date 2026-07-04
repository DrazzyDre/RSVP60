"""Admin guest-communications endpoints (Phase 5).

Status + history + reminder preview are readable by any active admin (viewers
included). Sending reminders requires an editor (owner/admin). Guests can never
reach these endpoints — email side effects for guests happen internally on the
public RSVP path.
"""

from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_admin, log_action, require_editor
from ..email import service as email_service
from ..email import templates
from ..models import Admin, CommunicationLog, Event, InviteTree, Rsvp
from ..schemas import (
    CommunicationLogOut,
    CommunicationLogPage,
    CommunicationsStatus,
    EmailBackendStatus,
    EmailPreview,
    ReminderAudience,
    ReminderRecipient,
    ReminderSendRequest,
    ReminderSendResult,
)

router = APIRouter(prefix="/api/admin/communications", tags=["communications"])


def _get_event_or_404(db: Session, event_id: str) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


def _email_status() -> EmailBackendStatus:
    return EmailBackendStatus(
        backend=settings.email_backend_name,
        is_live_provider=settings.is_email_provider_live,
        configured=settings.email_provider_configured,
        from_address=settings.email_from_address,
        from_name=settings.email_from_name,
    )


def _eligible_reminder_stmt(event_id: str, exclude_checked_in: bool):
    stmt = select(Rsvp).where(
        Rsvp.event_id == event_id,
        Rsvp.rsvp_status == "accepted",
        Rsvp.email_opt_in.is_(True),
        Rsvp.email.is_not(None),
        Rsvp.email != "",
    )
    if exclude_checked_in:
        stmt = stmt.where(Rsvp.checked_in_at.is_(None))
    return stmt


def _last_reminder_sent_at(db: Session, event_id: str):
    return db.execute(
        select(func.max(Rsvp.reminder_sent_at)).where(Rsvp.event_id == event_id)
    ).scalar_one_or_none()


def _log_out(row: CommunicationLog) -> CommunicationLogOut:
    return CommunicationLogOut.model_validate(row)


@router.get("/status", response_model=CommunicationsStatus)
def communications_status(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)
    eligible = int(
        db.execute(
            select(func.count()).select_from(
                _eligible_reminder_stmt(event_id, False).subquery()
            )
        ).scalar_one()
    )
    recent = (
        db.execute(
            select(CommunicationLog)
            .where(CommunicationLog.event_id == event_id)
            .order_by(CommunicationLog.created_at.desc())
            .limit(15)
        )
        .scalars()
        .all()
    )
    return CommunicationsStatus(
        event_id=event.id,
        event_name=event.name,
        email=_email_status(),
        host_notification_email=event.host_notification_email or "",
        notify_tree_exhausted=event.notify_tree_exhausted,
        notify_waitlisted_rsvp=event.notify_waitlisted_rsvp,
        eligible_reminder_count=eligible,
        last_reminder_sent_at=_last_reminder_sent_at(db, event_id),
        recent=[_log_out(r) for r in recent],
    )


@router.get("/reminder/preview", response_model=ReminderAudience)
def reminder_preview(
    event_id: str = Query(...),
    exclude_checked_in: bool = Query(False),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    event = _get_event_or_404(db, event_id)

    accepted = (
        db.execute(
            select(Rsvp)
            .where(Rsvp.event_id == event_id, Rsvp.rsvp_status == "accepted")
        )
        .scalars()
        .all()
    )
    total_accepted = len(accepted)
    without_email = sum(1 for r in accepted if not r.email)
    not_opted_in = sum(1 for r in accepted if r.email and not r.email_opt_in)

    eligible = (
        db.execute(_eligible_reminder_stmt(event_id, exclude_checked_in).order_by(Rsvp.full_name))
        .scalars()
        .all()
    )
    checked_in_eligible = sum(
        1 for r in db.execute(_eligible_reminder_stmt(event_id, False)).scalars().all()
        if r.checked_in_at is not None
    )

    sample = [
        ReminderRecipient(
            full_name=r.full_name,
            email=r.email or "",
            seats_requested=r.seats_requested,
            checked_in=r.checked_in_at is not None,
        )
        for r in eligible[:8]
    ]

    # Render a representative preview (first eligible guest, else a stand-in).
    preview_rsvp = eligible[0] if eligible else SimpleNamespace(
        full_name="Your Guest", seats_requested=2, invite_tree=None
    )
    subject, html, text = templates.render_reminder(event, preview_rsvp)

    return ReminderAudience(
        eligible_count=len(eligible),
        total_accepted=total_accepted,
        accepted_without_email=without_email,
        accepted_not_opted_in=not_opted_in,
        checked_in_eligible=checked_in_eligible,
        exclude_checked_in=exclude_checked_in,
        last_reminder_sent_at=_last_reminder_sent_at(db, event_id),
        sample=sample,
        preview=EmailPreview(subject=subject, html=html, text=text),
    )


@router.post("/reminder/send", response_model=ReminderSendResult)
def reminder_send(
    payload: ReminderSendRequest,
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_editor),
):
    event = _get_event_or_404(db, event_id)

    # Guard against accidental repeat sends unless the caller confirms a resend.
    last_sent = _last_reminder_sent_at(db, event_id)
    if last_sent is not None and not payload.confirm_resend:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Reminders were already sent on {last_sent:%Y-%m-%d %H:%M} UTC. "
                "Confirm to send again."
            ),
        )

    eligible = (
        db.execute(_eligible_reminder_stmt(event_id, payload.exclude_checked_in))
        .scalars()
        .all()
    )
    if not eligible:
        return ReminderSendResult(
            sent=0, failed=0, skipped=0,
            message="No eligible guests to remind (accepted + opted-in with an email).",
        )

    summary = email_service.send_event_reminder(db, event, eligible)
    log_action(
        db, admin, "reminder_sent", "event", event.id,
        {"exclude_checked_in": payload.exclude_checked_in, **summary},
    )
    db.commit()

    # Notify the host that the bulk send finished (best-effort, no dedup).
    try:
        email_service.send_host_alert(
            db, event, "host_reminder_complete", summary, dedup=False
        )
    except Exception:  # pragma: no cover - defensive
        pass

    return ReminderSendResult(
        **summary,
        message=(
            f"Reminder sent to {summary['sent']} guest(s)."
            + (f" {summary['failed']} failed." if summary["failed"] else "")
            + (f" {summary['skipped']} skipped." if summary["skipped"] else "")
        ),
    )


@router.get("/logs", response_model=CommunicationLogPage)
def communication_logs(
    event_id: str = Query(...),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
    communication_type: str | None = None,
    status_f: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _get_event_or_404(db, event_id)
    conditions = [CommunicationLog.event_id == event_id]
    if communication_type:
        conditions.append(CommunicationLog.communication_type == communication_type)
    if status_f:
        conditions.append(CommunicationLog.status == status_f)

    total = int(
        db.execute(
            select(func.count(CommunicationLog.id)).where(*conditions)
        ).scalar_one()
    )
    rows = (
        db.execute(
            select(CommunicationLog)
            .where(*conditions)
            .order_by(CommunicationLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return CommunicationLogPage(items=[_log_out(r) for r in rows], total=total)
