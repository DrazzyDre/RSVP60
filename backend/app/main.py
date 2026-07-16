"""GatherArc FastAPI application entrypoint."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import settings
from .database import Base, engine
from .observability import capture_exception, init_error_tracking
from .routers import admin, communications, notifications, public
from .storage import ensure_local_upload_dir


def configure_logging() -> None:
    """Structured-ish console logging. Never logs secrets (JWT/service-role/API
    keys, passwords, auth headers) — those are kept out of every log call."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


configure_logging()
logger = logging.getLogger("gatherarc")

app = FastAPI(
    title="GatherArc API",
    version="1.0.0",
    description="GatherArc — invitations, RSVPs, guest communications and event-day operations (multi-event).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # strictly driven by CORS_ORIGINS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve locally-uploaded flyers from /media when using the local storage
# backend. With the Supabase backend, images are served by Supabase instead.
_local_upload_dir = ensure_local_upload_dir()
if _local_upload_dir:
    app.mount("/media", StaticFiles(directory=_local_upload_dir), name="media")


@app.on_event("startup")
def on_startup() -> None:
    # Fail fast on unsafe production configuration. Log the failure clearly
    # (without secrets) so a bad deploy is obvious in the platform logs.
    try:
        settings.validate_runtime()
    except RuntimeError as exc:
        logger.error("Startup configuration error: %s", exc)
        raise

    # Optional error tracking (Sentry). No-op when SENTRY_DSN is unset or the SDK
    # is not installed — the app runs normally either way.
    init_error_tracking()

    # Log the effective runtime mode + backends (never the credentials).
    logger.info(
        "GatherArc starting: env=%s db=%s storage=%s email=%s error_tracking=%s trust_proxy=%s",
        settings.app_env,
        engine.dialect.name,
        settings.storage_backend,
        settings.email_backend_name,
        "on" if settings.error_tracking_enabled else "off",
        settings.trust_proxy_headers,
    )

    # Auto-create tables for local/dev convenience only. Production must run
    # Alembic migrations (`alembic upgrade head`) — never auto-create.
    if not settings.is_production:
        Base.metadata.create_all(bind=engine)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak stack traces to clients. Log server-side, return a friendly
    generic message. (FastAPI/Starlette HTTPExceptions are handled separately
    and keep their specific detail messages.)"""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    # Report to error tracking (no-op when disabled). This handler swallows the
    # exception, so we capture it explicitly rather than relying on propagation.
    capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )


@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
def health() -> dict:
    """Liveness: the process is up and serving. No dependencies checked.

    Use this for the hosting platform's health check."""
    return {
        "status": "ok",
        "service": "gatherarc-api",
        "env": settings.app_env,
    }


@app.get("/ready", tags=["health"])
@app.get("/api/ready", tags=["health"])
def ready() -> JSONResponse:
    """Readiness: verifies database connectivity with a trivial query.

    Returns 503 when the database is unavailable so a load balancer can hold
    traffic until the DB is reachable. Never exposes connection details."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return JSONResponse({"status": "ready", "database": "ok"})
    except Exception:
        logger.exception("Readiness check failed: database unavailable")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unavailable"},
        )


app.include_router(public.router)
app.include_router(admin.router)
app.include_router(communications.router)
app.include_router(notifications.router)
