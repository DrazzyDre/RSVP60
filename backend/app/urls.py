"""Public URL construction.

All guest-facing links (invite pages, QR codes, email links) are built from
``SITE_URL`` here so there is a single place that decides the public origin —
and a single place tests can assert against to prevent localhost/wrong-port
links leaking into production.
"""

from .config import settings


def site_origin() -> str:
    """The configured public frontend origin, without a trailing slash."""
    return settings.site_url.rstrip("/")


def invite_url(token: str) -> str:
    """The public invite link for an invite-tree token."""
    return f"{site_origin()}/invite/{token}"
