"""Email provider contract — the seam that keeps business logic vendor-free."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmailMessage:
    """A fully-rendered message ready to hand to a provider."""

    to: str
    subject: str
    html: str
    text: str


@dataclass
class EmailResult:
    """Outcome of a single send attempt.

    ``error_summary`` is a short, human-readable, secret-free reason — never a
    raw provider payload.
    """

    status: str  # "sent" | "failed"
    provider: str
    provider_message_id: str | None = None
    error_summary: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "sent"


class EmailProvider(ABC):
    """Send a single :class:`EmailMessage`.

    Implementations MUST NOT raise for ordinary delivery failures (bad address,
    provider 4xx/5xx, timeout) — they return a failed :class:`EmailResult` with
    a sanitized ``error_summary`` instead. The calling service treats delivery
    as a best-effort side effect and never lets it break the primary action.
    """

    name: str = "base"

    @abstractmethod
    def send(self, message: EmailMessage) -> EmailResult:  # pragma: no cover
        raise NotImplementedError
