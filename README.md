# RSVP60

A mobile-first **electronic invite & RSVP platform**. Guests open a private,
secure invite link, view a beautiful invitation, and RSVP (with an optional
plus-one / plus-two depending on their link). Admins manage everything from a
private dashboard.

Although the first seeded event is a **60th birthday celebration**, RSVP60 is
built as a **reusable, multi-event platform** — the same code powers birthdays,
weddings, funerals, memorials, anniversaries, church events, dinners,
conferences and other private events. Admins can create multiple events and
switch between them; every invite tree, RSVP, seat count and chart is scoped to
a single event.

> Product name stays **RSVP60** for now, even though the system is event-agnostic.

---

## Table of contents

- [Architecture & stack](#architecture--stack)
- [Core concepts](#core-concepts)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
  - [Option A — Docker Compose (recommended)](#option-a--docker-compose-recommended)
  - [Option B — without Docker](#option-b--without-docker)
  - [Seeding & resetting local data](#seeding--resetting-local-data)
- [Database migrations (Alembic)](#database-migrations-alembic)
- [Environment variables](#environment-variables)
- [Demo credentials & invite links](#demo-credentials--invite-links)
- [Testing](#testing)
- [API reference](#api-reference)
- [Deployment notes](#deployment-notes)
- [Security & operational notes](#security--operational-notes)
- [Known limitations](#known-limitations)

---

## Architecture & stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 15 (App Router) · TypeScript · Tailwind CSS · Recharts    |
| UI         | Hand-rolled shadcn/ui-style primitives, mobile-first              |
| Backend    | Python · FastAPI · SQLAlchemy 2.0 · Alembic                       |
| Database   | PostgreSQL / Supabase (SQLite by default for zero-config local dev)|
| Auth       | JWT-based admin auth (PyJWT + passlib pbkdf2_sha256)              |
| Local dev  | Docker Compose (Postgres + backend + frontend)                    |

The **backend is the single source of truth** for all seat/quota logic — the
frontend only mirrors it for UX.

**Local dev ports:** backend `8010` · frontend `3005` · postgres `5432`.

---

## Core concepts

### Events (first-class, multi-event)
Each event owns its invitation content (title, copy, flyer, venue, date/time,
dress code, gifts, RSVP deadline) and a lifecycle `status` (`draft`, `active`,
`closed`, `archived`). Public RSVPs are only accepted while an event is
`active` and before its `rsvp_deadline`.

### Invite trees (seat buckets)
An **invite tree** is a bucket of seats controlled by an admin, e.g. _Family:
50 seats_, _VIP: 15 seats_. Each tree has allocated/used/remaining seats, a
plus-one rule (`max_extra_guests`: `0` none, `1` +1, `2` +2), an
`active`/`paused` status (plus a derived `exhausted`/`almost_full`), and a
**secure, random, URL-safe token** that forms the public invite link. Guests
never see the tree name or who invited them.

### Seats, not people
- Guest alone = **1 seat** · Guest +1 = **2 seats** · Guest +2 = **3 seats**
- The RSVP form only offers options allowed by **both** the tree's plus-one rule
  **and** the remaining capacity.

### Waitlist (no hard blocking)
If an RSVP would exceed remaining seats it is saved as **waitlisted** (seats not
counted). Otherwise it is **accepted** and the seats count. Admins can set any
RSVP to `accepted`/`declined`/`waitlisted`/`cancelled`; promoting to `accepted`
re-validates seat availability.

---

## Project structure

```
RSVP60/
├── docker-compose.yml        # local Postgres + backend + frontend
├── backend/                  # FastAPI app
│   ├── Dockerfile
│   ├── alembic.ini           # Alembic config (DB URL comes from settings)
│   ├── migrations/           # Alembic env + versions/0001_initial_schema.py
│   ├── app/
│   │   ├── main.py           # entrypoint: runtime validation, health, error handler
│   │   ├── config.py         # env-driven settings (+ APP_ENV, prod guards)
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # events, admins, invite_trees, rsvps, audit_logs
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # password hashing + JWT
│   │   ├── deps.py           # auth dependency + audit helper
│   │   ├── seat_logic.py     # all seat/quota/waitlist rules
│   │   ├── ratelimit.py      # in-memory RSVP rate limiter
│   │   ├── utils.py          # phone normalization
│   │   ├── seed.py           # dev/demo seed (blocked in production)
│   │   └── routers/          # public.py, admin.py
│   ├── tests/smoke_test.py   # HTTP smoke suite (SQLite or Postgres)
│   ├── schema.sql            # reference Postgres schema
│   └── requirements.txt
└── frontend/                 # Next.js app
    ├── Dockerfile
    └── src/{app,components,lib}
```

---

## Running locally

**Prerequisites:** Docker + Docker Compose *(Option A)*, or Python 3.11+ and
Node.js 18+ *(Option B)*.

### Option A — Docker Compose (recommended)

Runs Postgres, the FastAPI backend (with migrations applied automatically), and
the Next.js frontend.

```bash
docker compose up --build
```

- Frontend → http://localhost:3005
- Backend  → http://localhost:8010  (docs at /docs, health at /health)
- Postgres → localhost:5432 (user/pass/db = `rsvp60`)

On startup the backend runs `alembic upgrade head` to create the schema, then
serves the API. Load demo data once the stack is up:

```bash
docker compose exec backend python -m app.seed
```

Reset everything (including the database volume):

```bash
docker compose down -v      # then `docker compose up --build` again
```

> If host port `5432` is already in use, change the **host** side of the db
> `ports` mapping in `docker-compose.yml` (e.g. `"5433:5432"`).

### Option B — without Docker

**Backend** (from `backend/`):

```bash
python -m venv .venv
# Activate: Windows PowerShell -> .venv\Scripts\Activate.ps1
#           Windows Git Bash   -> source .venv/Scripts/activate
#           macOS/Linux        -> source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # (Windows: copy .env.example .env)

# Create the schema (choose one):
alembic upgrade head          # migrations (recommended)
# ...or just rely on dev auto-create (APP_ENV=development creates tables on boot)

python -m app.seed            # load demo data (dev only)
uvicorn app.main:app --reload --port 8010
```

By default the backend uses a local **SQLite** file (`rsvp60.db`) so it runs
with zero setup. To use Postgres/Supabase, set `DATABASE_URL` in `.env`.

**Frontend** (from `frontend/`):

```bash
npm install
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8010
npm run dev -- -p 3005
```

Open http://localhost:3005/admin and sign in with the demo credentials below.

### Seeding & resetting local data

- **Seed / reset demo data:** `python -m app.seed` (or `docker compose exec
  backend python -m app.seed`). This is **destructive** — it drops all tables,
  recreates them, and inserts demo data. It is a **development-only** command
  and refuses to run when `APP_ENV=production` (override with
  `ALLOW_PROD_SEED=1` only if you truly mean it).
- **Reset the whole Docker stack:** `docker compose down -v`.
- **Reset the SQLite dev DB:** delete `backend/rsvp60.db` and re-seed.

---

## Database migrations (Alembic)

The schema is managed with Alembic. `migrations/env.py` reads `DATABASE_URL`
from the app settings, so migrations always target the same database as the app.

```bash
# from backend/ (venv active)
alembic upgrade head                          # apply all migrations
alembic downgrade -1                          # roll back one
alembic current                               # show current revision
alembic revision --autogenerate -m "message"  # create a migration from model changes
```

**Production uses migrations, not auto-create.** When `APP_ENV=production` the
app does **not** auto-create tables on startup — run `alembic upgrade head` as
part of your deploy. (In development the app auto-creates tables for
convenience.)

---

## Environment variables

### Backend (`backend/.env`)

| Variable                         | Default                       | Description                                                        |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `APP_ENV`                        | `development`                 | `development` \| `production`. Controls auto-create, seed guard, JWT guard. |
| `DATABASE_URL`                   | `sqlite:///./rsvp60.db`       | SQLAlchemy URL. `postgresql+psycopg2://...` for Postgres/Supabase. |
| `JWT_SECRET`                     | `dev-super-secret-change-me`  | **Required in production** — app refuses to boot with the default. |
| `ACCESS_TOKEN_EXPIRE_MINUTES`    | `720`                         | Admin session lifetime (token expiry is enforced).                 |
| `SITE_URL`                       | `http://localhost:3005`       | Frontend origin; used to build shareable invite links.             |
| `CORS_ORIGINS`                   | `http://localhost:3005,...`   | Comma-separated allowed origins (no wildcards).                    |
| `RSVP_RATE_LIMIT_MAX`            | `8`                           | Max public RSVP submissions per IP per window.                     |
| `RSVP_RATE_LIMIT_WINDOW_SECONDS` | `60`                          | Rate-limit window in seconds.                                      |

The API port is a uvicorn flag (`--port 8010`), not an env var.

### Frontend (`frontend/.env.local`)

| Variable              | Default                 | Description                        |
| --------------------- | ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8010` | Base URL of the FastAPI backend.   |

---

## Demo credentials & invite links

After running `python -m app.seed`:

**Admin logins**

| Email               | Password     |
| ------------------- | ------------ |
| `admin@rsvp60.com`  | `admin123`   |
| `host@rsvp60.com`   | `host1234`   |
| `planner@rsvp60.com`| `planner123` |

**Seeded events:** _Chief Emmanuel Adeyemi's 60th Birthday_ (4 trees) and
_Tolu & Bisi's Wedding_ (2 trees).

**Demo invite links** (`/invite/<token>`):

| Tree             | Path                                             |
| ---------------- | ------------------------------------------------ |
| Family (+1)      | `/invite/fam-demo-token-000000000001`            |
| Church Friends   | `/invite/church-demo-token-00000000002`          |
| Work Friends (+1)| `/invite/work-demo-token-0000000000003`          |
| VIP Guests (+2)  | `/invite/vip-demo-token-00000000000004` (full → waitlist) |
| Bride's Family   | `/invite/wed-bride-token-00000000000005`         |
| Couple's Friends | `/invite/wed-friends-token-0000000000006`        |

> Invite tokens created via the admin UI are cryptographically random.

---

## Testing

A standard-library HTTP smoke suite verifies the core behaviours against a
running backend (SQLite **or** Postgres):

```bash
# with the backend running on :8010 and a freshly seeded database
cd backend
python -m tests.smoke_test          # BASE_URL defaults to http://localhost:8010
```

It asserts: event scoping, invite-tree scoping, secure token resolution, no
tree-name leak on the public endpoint, duplicate-RSVP-by-phone, seat
release/recalculation on update, accepted-vs-waitlisted seat counting, admin
promotion seat validation, and per-event CSV export.

---

## API reference

**Public**
- `GET  /health`, `GET /api/health`
- `GET  /api/invites/{token}` — invite payload (never includes the tree name)
- `POST /api/invites/{token}/rsvp` — submit/update an RSVP (rate limited)

**Admin** (require `Authorization: Bearer <token>`)
- `POST  /api/admin/login` · `GET /api/admin/me`
- `GET   /api/admin/events` · `POST /api/admin/events` · `GET|PATCH /api/admin/events/{id}`
- `GET   /api/admin/invite-trees?event_id=…` · `POST` · `PATCH /api/admin/invite-trees/{id}`
- `GET   /api/admin/rsvps?event_id=…` (filters: `status`, `invite_tree_id`, `search`)
- `PATCH /api/admin/rsvps/{id}`
- `GET   /api/admin/rsvps/export?event_id=…` — CSV
- `GET   /api/admin/dashboard/summary?event_id=…` · `GET /api/admin/dashboard/charts?event_id=…`

---

## Deployment notes

A typical production layout: **Vercel** (frontend) + **Render/Railway/Fly.io**
(backend) + **Supabase** (Postgres).

**Supabase (database)**
1. Create a project and copy the connection string.
2. Set it as `DATABASE_URL` on the backend host (`postgresql+psycopg2://...`).
3. Schema is applied by `alembic upgrade head` on deploy (do **not** rely on
   auto-create in production).

**Backend (Render / Railway / Fly.io)**
- Build: `pip install -r requirements.txt`
- Release/pre-deploy: `alembic upgrade head`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Env: `APP_ENV=production`, a strong `JWT_SECRET` (`openssl rand -hex 32`),
  `DATABASE_URL`, `SITE_URL` (your frontend URL), `CORS_ORIGINS` (your frontend
  origin(s)). The app **refuses to boot** in production with the default secret.
- Do **not** run `app.seed` against production; create your first event via the
  admin UI. (Provision admin accounts by adapting the seed or a one-off script.)

**Frontend (Vercel)**
- Set `NEXT_PUBLIC_API_URL` to the deployed backend URL.
- Add the Vercel domain to the backend's `CORS_ORIGINS` and to `SITE_URL`.

---

## Security & operational notes

- **Passwords** are hashed with passlib `pbkdf2_sha256` (no plaintext stored).
- **JWT**: signed with `JWT_SECRET`; expiry (`exp`) is set and enforced on every
  request; production refuses the insecure default secret.
- **Auth**: all `/api/admin/*` routes (except `login`) require a valid Bearer
  token and reject anonymous/invalid/expired tokens with `401`.
- **Frontend** stores only the JWT (in `localStorage`) to authorize API calls;
  no other sensitive data is persisted client-side.
- **CORS** is driven strictly by `CORS_ORIGINS` (no wildcard).
- **No stack traces** leak to clients — a global handler logs the real error
  server-side and returns a generic `500` message. Request bodies are strictly
  validated by Pydantic; phone numbers are normalized server-side.
- **Rate limiting**: public RSVP submissions are throttled per client IP.
- **Health**: `GET /health` (and `/api/health`) for uptime checks.

---

## Known limitations

- Admin accounts are seed-provisioned — no in-app user management/self-signup.
- The RSVP rate limiter is **in-process** (fine for a single instance). Behind a
  multi-instance load balancer, use a shared store (e.g. Redis) instead.
- Duplicate protection is one RSVP per **phone number per event**; guests update
  their RSVP by re-submitting with the same phone number.
- No email/SMS notifications, flyer uploads (flyer is a URL), QR check-in, or
  billing/multi-org features (intentionally out of scope for this phase).
- The frontend Docker image runs the Next.js **dev** server for local
  convenience; production frontend is expected to deploy to Vercel.
