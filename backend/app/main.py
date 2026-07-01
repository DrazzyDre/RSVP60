"""RSVP60 FastAPI application entrypoint."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import Base, engine
from .routers import admin, public

logger = logging.getLogger("rsvp60")

app = FastAPI(
    title="RSVP60 API",
    version="1.0.0",
    description="Electronic invite & RSVP platform (multi-event).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # strictly driven by CORS_ORIGINS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    # Fail fast on unsafe production configuration.
    settings.validate_runtime()

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
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )


@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "rsvp60-api",
        "env": settings.app_env,
    }


app.include_router(public.router)
app.include_router(admin.router)
