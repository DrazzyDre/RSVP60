#!/usr/bin/env bash
# Production start command for the RSVP60 API.
#
# Run from the backend/ directory (Render rootDir: backend). It:
#   1. applies Alembic migrations (the source of truth for the schema),
#   2. starts uvicorn on the platform-provided $PORT,
#   3. fails fast (set -e) if migrations fail — the process never starts on a
#      broken schema, and the platform surfaces the error.
#
# It intentionally does NOT run the development seed — production data must
# never be seeded/reset automatically.
set -euo pipefail

echo "[start] Applying database migrations (alembic upgrade head)…"
alembic upgrade head

PORT="${PORT:-8010}"
echo "[start] Starting uvicorn on 0.0.0.0:${PORT}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
