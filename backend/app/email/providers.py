"""Concrete email providers.

* :class:`ConsoleEmailProvider` — logs the message and "succeeds". The safe
  default for local development, automated tests and CI (no external calls, no
  credentials required).
* :class:`ResendEmailProvider` — posts to the Resend HTTP API using only the
  standard library (no vendor SDK), mirroring how storage.py talks to Supabase.

``get_provider()`` picks one from configuration.
"""

import json
import logging
import urllib.error
import urllib.request
import uuid

from ..config import settings
from .base import EmailMessage, EmailProvider, EmailResult

logger = logging.getLogger("rsvp60.email")

RESEND_ENDPOINT = "https://api.resend.com/emails"


def _from_header() -> str:
    name = (settings.email_from_name or "RSVP60").strip()
    address = (settings.email_from_address or "").strip()
    if name and address:
        return f"{name} <{address}>"
    return address or "onboarding@resend.dev"


class ConsoleEmailProvider(EmailProvider):
    """Pretend-send by logging. Never touches the network."""

    name = "console"

    def send(self, message: EmailMessage) -> EmailResult:
        logger.info(
            "[email:console] to=%s subject=%r\n%s",
            message.to,
            message.subject,
            message.text,
        )
        # A stable, obviously-fake id so logs/tests can assert a "sent" result
        # without a real provider.
        return EmailResult(
            status="sent",
            provider=self.name,
            provider_message_id=f"console-{uuid.uuid4().hex[:12]}",
        )


class ResendEmailProvider(EmailProvider):
    """Transactional email via Resend (https://resend.com)."""

    name = "resend"

    def __init__(self, api_key: str, timeout: float = 10.0):
        self._api_key = api_key
        self._timeout = timeout

    def send(self, message: EmailMessage) -> EmailResult:
        if not self._api_key:
            return EmailResult(
                status="failed",
                provider=self.name,
                error_summary="Email provider is not configured.",
            )
        payload = json.dumps(
            {
                "from": _from_header(),
                "to": [message.to],
                "subject": message.subject,
                "html": message.html,
                "text": message.text,
            }
        ).encode()
        req = urllib.request.Request(
            RESEND_ENDPOINT,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                body = json.loads(resp.read().decode() or "{}")
            return EmailResult(
                status="sent",
                provider=self.name,
                provider_message_id=str(body.get("id") or "") or None,
            )
        except urllib.error.HTTPError as exc:
            # Record only the status code + a short reason — never the response
            # body (which can echo request data) and never the API key.
            logger.warning("Resend send failed: HTTP %s", exc.code)
            return EmailResult(
                status="failed",
                provider=self.name,
                error_summary=f"Provider returned HTTP {exc.code}.",
            )
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            logger.warning("Resend send error: %s", type(exc).__name__)
            return EmailResult(
                status="failed",
                provider=self.name,
                error_summary=f"Provider unreachable ({type(exc).__name__}).",
            )


def get_provider() -> EmailProvider:
    """Return the configured provider (console unless a live one is selected)."""
    if settings.email_backend_name == "resend":
        return ResendEmailProvider(
            settings.resend_api_key, timeout=settings.email_timeout_seconds
        )
    return ConsoleEmailProvider()
