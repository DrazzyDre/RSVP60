"""Optional error tracking (Sentry) — Phase 7 observability.

Design goals
------------
* **Optional.** With ``SENTRY_DSN`` empty (the default) this module does nothing
  and the app runs exactly as before. It is also a no-op if the ``sentry_sdk``
  package is not installed, so tests / CI / minimal installs never require it.
* **Safe.** A ``before_send`` hook scrubs request headers (which carry the auth
  bearer token / API keys), cookies and request bodies (which may carry guest
  form data) before any event leaves the process. The DSN itself is never
  returned by the API.
* **Useful.** Events are tagged with the app name, environment and — where a
  request scope is bound — the route and event id, so an operator can tell which
  event was affected.

Nothing here ever raises into application code: initialization and capture are
wrapped defensively.
"""

from __future__ import annotations

import logging

from .config import settings

logger = logging.getLogger("gatherarc.observability")

# Module-level flag so capture_exception() is a cheap no-op when disabled.
_active = False

# Header / field names scrubbed from every outgoing event (defence in depth —
# we also avoid attaching request bodies at all).
_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "apikey",
    "x-api-key",
    "x-apikey",
    "proxy-authorization",
}


def _scrub_headers(headers) -> None:
    """Redact sensitive headers in-place on a Sentry event 'headers' mapping."""
    if not isinstance(headers, dict):
        return
    for key in list(headers.keys()):
        if str(key).lower() in _SENSITIVE_HEADERS:
            headers[key] = "[scrubbed]"


def _before_send(event, hint):
    """Scrub sensitive data before an event is sent to Sentry.

    Removes auth headers, cookies and request bodies. Guest form data therefore
    never leaves the process, and the bearer token / API key in the
    Authorization header is never transmitted.
    """
    try:
        request = event.get("request")
        if isinstance(request, dict):
            _scrub_headers(request.get("headers"))
            # Drop the body entirely — it may contain guest PII / form data.
            request.pop("data", None)
            request.pop("cookies", None)
            # Never ship raw query strings (could contain identifiers).
            if "query_string" in request:
                request["query_string"] = ""
    except Exception:  # pragma: no cover - defensive
        logger.debug("before_send scrub failed", exc_info=True)
    return event


def init_error_tracking() -> bool:
    """Initialize Sentry if configured. Returns True when active.

    Safe to call unconditionally at startup: returns False (and logs nothing
    noisy) when no DSN is set or the SDK is not installed.
    """
    global _active
    if not settings.error_tracking_enabled:
        logger.info("Error tracking disabled (no SENTRY_DSN configured).")
        return False
    try:
        import sentry_sdk
    except ImportError:
        logger.warning(
            "SENTRY_DSN is set but the 'sentry-sdk' package is not installed; "
            "error tracking is disabled. Add sentry-sdk to enable it."
        )
        return False
    try:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment_name,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=settings.sentry_profiles_sample_rate,
            # We scrub explicitly; also ask the SDK not to attach PII.
            send_default_pii=False,
            before_send=_before_send,
        )
        sentry_sdk.set_tag("app", "gatherarc")
        sentry_sdk.set_tag("environment", settings.sentry_environment_name)
        _active = True
        logger.info(
            "Error tracking enabled (Sentry, environment=%s).",
            settings.sentry_environment_name,
        )
        return True
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to initialize error tracking; continuing without it.")
        _active = False
        return False


def is_active() -> bool:
    return _active


def capture_exception(exc: BaseException) -> None:
    """Report an unhandled exception if error tracking is active. No-op otherwise."""
    if not _active:
        return
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover - defensive
        logger.debug("capture_exception failed", exc_info=True)


def bind_request_scope(
    *, route: str, method: str, event_id: str | None = None
) -> None:
    """Tag the current Sentry scope with safe request context. No-op when off.

    Only non-sensitive, low-cardinality-ish identifiers are attached: the route
    template, HTTP method and (when present) the event id — never headers, the
    body, tokens or guest PII.
    """
    if not _active:
        return
    try:
        import sentry_sdk

        scope = sentry_sdk.get_current_scope()
        scope.set_tag("route", route)
        scope.set_tag("http.method", method)
        if event_id:
            scope.set_tag("event_id", event_id)
    except Exception:  # pragma: no cover - defensive
        logger.debug("bind_request_scope failed", exc_info=True)
