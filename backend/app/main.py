"""RSVP60 FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import admin, public

app = FastAPI(
    title="RSVP60 API",
    version="1.0.0",
    description="Electronic invite & RSVP platform for a 60th birthday event.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    # For the MVP we auto-create tables on boot. In production run the SQL
    # migration (backend/schema.sql) or a proper migration tool instead.
    Base.metadata.create_all(bind=engine)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "rsvp60-api"}


app.include_router(public.router)
app.include_router(admin.router)
