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


def client_ip(request: Request) -> str:
    """Best-effort client IP for rate-limit keys.

    ``X-Forwarded-For`` is honoured ONLY when ``TRUST_PROXY_HEADERS`` is enabled
    — i.e. when the app is known to sit behind a single trusted reverse proxy
    (Render/Railway/Fly/LB) that sets it. In that case the original client is
    the left-most entry. Otherwise, and always as a fallback, we use the direct
    socket peer so a client can't spoof its IP with a forged header.
    """
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    return request.client.host if request.client else "unknown"


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
    _rsvp_limiter.check(client_ip(request))


class FailedAttemptLimiter:
    """Blocks a key after too many *failed* attempts within a window.

    Unlike the sliding-window limiter, only explicit failures are recorded and a
    success clears the counter — so it throttles brute-force admin logins without
    ever counting successful sign-ins or normal authenticated API calls.
    """

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        cutoff = now - self.window_seconds
        hits = self._failures[key]
        while hits and hits[0] < cutoff:
            hits.popleft()
        return hits

    def check_blocked(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._prune(key, now)
            if len(hits) >= self.max_failures:
                retry = max(1, int(self.window_seconds - (now - hits[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        "Too many failed sign-in attempts. Please wait about "
                        f"{retry} seconds and try again."
                    ),
                    headers={"Retry-After": str(retry)},
                )

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


_login_limiter = FailedAttemptLimiter(
    settings.login_rate_limit_max_failures,
    settings.login_rate_limit_window_seconds,
)


def _login_key(request: Request, email: str) -> str:
    return f"{client_ip(request)}|{(email or '').strip().lower()}"


def check_login_not_blocked(request: Request, email: str) -> None:
    """Raise 429 if this IP+email has too many recent failed logins."""
    _login_limiter.check_blocked(_login_key(request, email))


def record_login_failure(request: Request, email: str) -> None:
    _login_limiter.record_failure(_login_key(request, email))


def reset_login_failures(request: Request, email: str) -> None:
    _login_limiter.reset(_login_key(request, email))
