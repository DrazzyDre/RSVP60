"""Render event-aware transactional emails (HTML + plain-text).

Rules baked in here:
* every guest- or admin-supplied string is HTML-escaped before it lands in
  markup (guest names, notes, event copy);
* guest-facing emails NEVER include the invite tree name or the check-in token;
* the only link exposed to guests is the public invite link they already have.
"""

import html
import re
from datetime import datetime

from ..config import settings

BRAND_COLOR = "#1E2A6B"  # royal — default when the event has no accent colour.
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _accent(event) -> str:
    color = (getattr(event, "accent_color", "") or "").strip()
    return color if _HEX.match(color) else BRAND_COLOR


def _esc(value) -> str:
    return html.escape(str(value or ""))


def _fmt_date(dt: datetime | None) -> str:
    if not dt:
        return ""
    # Cross-platform (no %-d): strip a possible leading zero from the day.
    day = dt.strftime("%d").lstrip("0") or "0"
    return dt.strftime(f"%A, {day} %B %Y")


def _seats_phrase(n: int) -> str:
    return f"{n} seat" if n == 1 else f"{n} seats"


def _invite_url(rsvp) -> str:
    tree = getattr(rsvp, "invite_tree", None)
    token = getattr(tree, "token", "") if tree else ""
    if not token:
        return ""
    return f"{settings.site_url.rstrip('/')}/invite/{token}"


# --------------------------------------------------------------------------- #
# Shared layout
# --------------------------------------------------------------------------- #
def _detail_rows(event) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    when = _fmt_date(getattr(event, "event_date", None))
    if getattr(event, "event_time", ""):
        when = f"{when} · {event.event_time}".strip(" ·") if when else event.event_time
    if when:
        rows.append(("When", when))
    venue = getattr(event, "venue_name", "") or ""
    if getattr(event, "venue_address", ""):
        venue = f"{venue} — {event.venue_address}".strip(" —") if venue else event.venue_address
    if venue:
        rows.append(("Where", venue))
    if getattr(event, "dress_code", ""):
        rows.append(("Dress code", event.dress_code))
    return rows


def _wrap(event, heading: str, intro_html: str, extra_html: str = "") -> str:
    accent = _accent(event)
    title = _esc(getattr(event, "title", "") or getattr(event, "name", ""))
    host = _esc(getattr(event, "host_or_celebrant_name", "") or "")
    contact = _esc(getattr(event, "contact_phone", "") or "")
    maps_url = (getattr(event, "maps_url", "") or "").strip()

    detail_html = ""
    for label, value in _detail_rows(event):
        detail_html += (
            f'<tr><td style="padding:4px 12px 4px 0;color:#6b7280;'
            f'font-size:13px;white-space:nowrap;vertical-align:top">{_esc(label)}</td>'
            f'<td style="padding:4px 0;color:#111827;font-size:14px">{_esc(value)}</td></tr>'
        )
    directions = ""
    if maps_url.startswith(("http://", "https://")):
        directions = (
            f'<p style="margin:16px 0 0"><a href="{_esc(maps_url)}" '
            f'style="color:{accent};font-weight:600;text-decoration:none">View directions →</a></p>'
        )
    footer_contact = (
        f'<p style="margin:0 0 4px">Questions? Contact the host'
        f'{f" on {contact}" if contact else ""}.</p>'
        if contact
        else ""
    )

    return f"""\
<!doctype html>
<html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <tr><td style="background:{accent};padding:20px 28px">
      <div style="color:#ffffff;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">RSVP</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:2px">{title or "Your event"}</div>
      {f'<div style="color:#ffffff;font-size:13px;opacity:.85;margin-top:2px">with {host}</div>' if host else ""}
    </td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827">{_esc(heading)}</h1>
      {intro_html}
      {f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">{detail_html}</table>' if detail_html else ""}
      {directions}
      {extra_html}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
      {footer_contact}
      <p style="margin:0">You received this because you shared your email when responding to this invitation.</p>
    </td></tr>
  </table>
</body></html>"""


def _text_details(event) -> str:
    lines = [f"{label}: {value}" for label, value in _detail_rows(event)]
    maps_url = (getattr(event, "maps_url", "") or "").strip()
    if maps_url.startswith(("http://", "https://")):
        lines.append(f"Directions: {maps_url}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Guest emails
# --------------------------------------------------------------------------- #
def render_confirmation(event, rsvp) -> tuple[str, str, str]:
    title = getattr(event, "title", "") or getattr(event, "name", "") or "the event"
    name = getattr(rsvp, "full_name", "") or "there"
    status = rsvp.rsvp_status
    seats = getattr(rsvp, "seats_requested", 0) or 0
    invite_url = _invite_url(rsvp)

    if status == "accepted":
        subject = f"You're confirmed for {title}"
        heading = "Your RSVP is confirmed 🎉"
        body = (
            f"Thank you, {name}! We've reserved {_seats_phrase(seats)} for you. "
            "We can't wait to celebrate with you."
        )
        status_line = f"Status: Confirmed · {_seats_phrase(seats)}"
    elif status == "waitlisted":
        subject = f"You're on the waitlist for {title}"
        heading = "You're on the waitlist"
        body = (
            f"Thank you, {name}. This invitation is currently full, so your "
            f"request for {_seats_phrase(seats)} is on the waitlist. Your attendance "
            "is not yet confirmed — the host will be in touch if space opens up."
        )
        status_line = f"Status: Waitlisted (not yet confirmed) · requested {_seats_phrase(seats)}"
    else:  # declined / cancelled
        subject = f"Thanks for letting us know — {title}"
        heading = "Thanks for your response"
        body = (
            f"Thank you for letting us know, {name}. You'll be missed — but we're "
            "grateful you took the time to respond."
        )
        status_line = "Status: Not attending"

    deadline = _fmt_date(getattr(event, "rsvp_deadline", None))
    extra = ""
    if invite_url and status != "declined":
        extra = (
            f'<p style="margin:16px 0 0;font-size:14px;color:#374151">Need to change your '
            f'response?{f" You have until {_esc(deadline)}." if deadline else ""} '
            f'<a href="{_esc(invite_url)}" style="color:{_accent(event)};font-weight:600;'
            f'text-decoration:none">Update your RSVP</a></p>'
        )
    intro = (
        f'<p style="margin:0 0 8px;font-size:15px;color:#374151">{_esc(body)}</p>'
        f'<p style="margin:0;font-size:14px;font-weight:600;color:#111827">{_esc(status_line)}</p>'
    )
    html_out = _wrap(event, heading, intro, extra)

    text = f"{heading}\n\n{body}\n\n{status_line}\n"
    details = _text_details(event)
    if details:
        text += f"\n{details}\n"
    if invite_url and status != "declined":
        text += f"\nUpdate your RSVP: {invite_url}\n"
    return subject, html_out, text


def render_status_update(event, rsvp, old_status: str) -> tuple[str, str, str]:
    title = getattr(event, "title", "") or getattr(event, "name", "") or "the event"
    name = getattr(rsvp, "full_name", "") or "there"
    status = rsvp.rsvp_status
    seats = getattr(rsvp, "seats_requested", 0) or 0

    friendly = {
        "accepted": "confirmed",
        "waitlisted": "moved to the waitlist",
        "declined": "recorded as not attending",
        "cancelled": "cancelled",
    }.get(status, status)

    subject = f"Update to your RSVP for {title}"
    heading = "Your RSVP has been updated"
    if status == "accepted":
        body = (
            f"Good news, {name}! Your RSVP for {title} is now confirmed with "
            f"{_seats_phrase(seats)}. We look forward to seeing you."
        )
    elif status == "waitlisted":
        body = (
            f"Hello {name}, your RSVP for {title} has been {friendly}. Your "
            "attendance is not yet confirmed; the host will reach out if space opens."
        )
    else:
        body = f"Hello {name}, your RSVP for {title} has been {friendly}."

    intro = (
        f'<p style="margin:0 0 8px;font-size:15px;color:#374151">{_esc(body)}</p>'
        f'<p style="margin:0;font-size:14px;font-weight:600;color:#111827">'
        f'New status: {_esc(friendly.capitalize())}</p>'
    )
    html_out = _wrap(event, heading, intro)
    text = f"{heading}\n\n{body}\n\nNew status: {friendly}\n"
    details = _text_details(event)
    if details:
        text += f"\n{details}\n"
    return subject, html_out, text


def render_reminder(event, rsvp) -> tuple[str, str, str]:
    title = getattr(event, "title", "") or getattr(event, "name", "") or "the event"
    name = getattr(rsvp, "full_name", "") or "there"
    seats = getattr(rsvp, "seats_requested", 0) or 0
    invite_url = _invite_url(rsvp)

    subject = f"Reminder: {title} is coming up"
    heading = "We can't wait to see you"
    body = (
        f"Hello {name}, this is a friendly reminder about {title}. We have "
        f"{_seats_phrase(seats)} reserved for you — here are the details:"
    )
    extra = ""
    if invite_url:
        extra = (
            f'<p style="margin:16px 0 0;font-size:14px;color:#374151">'
            f'<a href="{_esc(invite_url)}" style="color:{_accent(event)};font-weight:600;'
            f'text-decoration:none">View the invitation →</a></p>'
        )
    intro = f'<p style="margin:0;font-size:15px;color:#374151">{_esc(body)}</p>'
    html_out = _wrap(event, heading, intro, extra)
    text = f"{heading}\n\n{body}\n"
    details = _text_details(event)
    if details:
        text += f"\n{details}\n"
    if invite_url:
        text += f"\nInvitation: {invite_url}\n"
    return subject, html_out, text


def render_check_in_ack(event, rsvp) -> tuple[str, str, str]:
    title = getattr(event, "title", "") or getattr(event, "name", "") or "the event"
    name = getattr(rsvp, "full_name", "") or "there"
    seats = getattr(rsvp, "checked_in_seats", None) or getattr(rsvp, "seats_requested", 0) or 0

    subject = f"Welcome to {title}!"
    heading = "You're checked in 🎊"
    body = (
        f"Welcome, {name}! You're checked in for {title} with "
        f"{_seats_phrase(seats)}. Enjoy the celebration!"
    )
    intro = f'<p style="margin:0;font-size:15px;color:#374151">{_esc(body)}</p>'
    html_out = _wrap(event, heading, intro)
    text = f"{heading}\n\n{body}\n"
    return subject, html_out, text


# --------------------------------------------------------------------------- #
# Host alerts (internal — not guest-facing)
# --------------------------------------------------------------------------- #
def render_host_alert(event, alert_type: str, context: dict) -> tuple[str, str, str]:
    title = getattr(event, "title", "") or getattr(event, "name", "") or "your event"
    ctx = {k: _esc(v) for k, v in (context or {}).items()}

    if alert_type == "host_tree_exhausted":
        subject = f"[{title}] An invite allocation is now full"
        heading = "An invite allocation is full"
        body = (
            f"The invite group “{ctx.get('tree_name', '')}” for {title} has used all "
            f"{ctx.get('allocated', '')} of its seats. New guests in this group will "
            "be waitlisted until you free up or add capacity."
        )
    elif alert_type == "host_waitlisted_rsvp":
        subject = f"[{title}] A guest was waitlisted"
        heading = "A guest was waitlisted"
        body = (
            f"{ctx.get('guest_name', 'A guest')} requested {ctx.get('seats', '')} "
            f"seat(s) for {title}, but the allocation was full, so they were "
            "waitlisted. Accept them from the RSVPs page if you can make room."
        )
    elif alert_type == "host_reminder_complete":
        subject = f"[{title}] Reminder emails sent"
        heading = "Reminder emails sent"
        body = (
            f"Your reminder for {title} finished sending: "
            f"{ctx.get('sent', '0')} sent, {ctx.get('failed', '0')} failed, "
            f"{ctx.get('skipped', '0')} skipped."
        )
    else:
        subject = f"[{title}] Notification"
        heading = "Event notification"
        body = f"An update occurred for {title}."

    intro = f'<p style="margin:0;font-size:15px;color:#374151">{body}</p>'
    html_out = _wrap(event, heading, intro)
    text = f"{heading}\n\n{re.sub('<[^>]+>', '', body)}\n"
    return subject, html_out, text
