"""Minimal in-memory sliding-window rate limiter.

Pragmatic MVP protection for the public RSVP endpoint against accidental or
abusive rapid submissions. This is per-process (fine for a single instance);
a multi-instance deployment behind a load balancer should use a shared store
(e.g. Redis) instead — noted in the README's limitations.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .config import settings


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry = max(1, int(self.window_seconds - (now - hits[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        "You're sending RSVPs a little too quickly. Please wait a "
                        f"moment and try again in about {retry} seconds."
                    ),
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)


_rsvp_limiter = SlidingWindowRateLimiter(
    settings.rsvp_rate_limit_max, settings.rsvp_rate_limit_window_seconds
)


def rate_limit_rsvp(request: Request) -> None:
    """FastAPI dependency: throttle public RSVP submissions per client IP."""
    client_ip = request.client.host if request.client else "unknown"
    _rsvp_limiter.check(client_ip)
