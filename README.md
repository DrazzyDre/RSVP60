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
- [Invite presentation & sharing](#invite-presentation--sharing)
- [Flyer uploads & storage](#flyer-uploads--storage)
- [Admin roles & management](#admin-roles--management)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
  - [Option A — Docker Compose (recommended)](#option-a--docker-compose-recommended)
  - [Option B — without Docker](#option-b--without-docker)
  - [Seeding & resetting local data](#seeding--resetting-local-data)
- [Database migrations (Alembic)](#database-migrations-alembic)
- [Environment variables](#environment-variables)
- [Demo credentials & invite links](#demo-credentials--invite-links)
- [Testing](#testing)
- [Final local verification](#final-local-verification)
- [Continuous integration (CI)](#continuous-integration-ci)
- [Developer shortcuts (Makefile)](#developer-shortcuts-makefile)
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
Each event owns its invitation content (title, invite headline/message, copy,
flyer, venue, date/time, dress code, gifts, RSVP deadline, theme) and a
lifecycle `status` (`draft`, `active`, `closed`, `archived`). Public RSVPs are
only accepted while an event is `active` and — when `auto_close_rsvp` is on —
before its `rsvp_deadline`. When `auto_close_rsvp` is off, the deadline is shown
to guests but RSVPs stay open (admins can always edit RSVPs directly).

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

## Invite presentation & sharing

RSVP60 renders each public invite entirely from **event data** — there is no
birthday-specific hardcoding, so any event type looks right.

- **Branding fields** — `invite_headline` (hero banner line) and `invite_message`
  (prominent copy, falling back to the description) let admins tailor the wording.
- **Themes** — a lightweight `theme_preset` (`elegant`, `classic`, `joyful`,
  `minimal`, `formal`) plus an optional `accent_color` (hex) and
  `background_preset` (`soft`, `plain`, `festive`) restyle the invite tastefully.
  `elegant` reproduces the original royal-and-gold look, so existing invites are
  unchanged.
- **WhatsApp share** — each invite tree in the admin dashboard can copy a
  WhatsApp-ready message or open WhatsApp share. The message contains the event
  name, date, venue and the token-based link — **never the invite tree name**.
- **QR codes** — each tree can display a QR code for its invite link and download
  it as **PNG** or **SVG** (handy for printed materials), or copy the link.
- **Readiness checklist** — the admin **Settings** page shows a pre-share
  checklist (details, flyer, venue + map, gifts, ≥1 invite tree, RSVP deadline,
  and a locally-tracked "invite link tested" acknowledgement).

## Flyer uploads & storage

Admins can **upload, preview, replace and remove** an event flyer/image from the
event edit form (or paste an external `flyer_url` as a fallback). Uploads are
validated: **JPG, PNG or WebP**, up to **5 MB** by default; anything else is
rejected with a friendly error. The uploaded image always takes priority over
`flyer_url`, and the API returns a resolved `flyer_image_url` the frontend
displays.

Storage is pluggable via `STORAGE_BACKEND`:

- **`local`** (default) — files are written under `UPLOAD_DIR` (default
  `backend/uploads/`, git-ignored) and served by the API from `/media/<path>`.
  Zero-config for local dev and Docker.
- **`supabase`** — files are pushed to a Supabase Storage bucket. Set
  `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  (optionally) `SUPABASE_STORAGE_BUCKET`. Create a **public** bucket in Supabase
  Storage named to match `SUPABASE_STORAGE_BUCKET` (default `flyers`). The app
  refuses to boot in this mode until the URL and key are provided.

**All uploads are backend-only and validated server-side:** the type
(JPG/PNG/WebP) and size (≤ `MAX_UPLOAD_BYTES`, 5 MB default) are enforced on the
API, filenames are randomized (`flyers/<event_id>/<uuid>.<ext>` — the client
filename is never trusted), and the public invite receives only a resolved,
safe `flyer_image_url`. The **service role key is a server-only secret** and is
never sent to the frontend or embedded in any `NEXT_PUBLIC_*` variable.

> The local backend stores files on the container's disk. In the dev Docker
> stack a `backend_uploads` volume keeps them across restarts (wiped by
> `docker compose down -v`). For production, use the Supabase backend (or another
> object store) so images survive redeploys and scale across instances.

---

## Admin roles & management

Admins have one of three roles. **All permissions are enforced on the backend**;
the frontend only mirrors them to show/hide UI.

| Capability                          | Owner | Admin | Viewer |
| ----------------------------------- | :---: | :---: | :----: |
| View dashboard / trees / RSVPs      |  ✅   |  ✅   |   ✅   |
| Export RSVPs (CSV)                  |  ✅   |  ✅   |   ✅   |
| Create / edit events, trees, RSVPs  |  ✅   |  ✅   |   ❌   |
| Upload / remove flyers              |  ✅   |  ✅   |   ❌   |
| Manage admins (create/role/disable) |  ✅   |  ❌   |   ❌   |

- **Owners** manage other admins from **`/admin/admins`** (owner-only): create an
  admin, set their role, deactivate/reactivate, and set/reset a password.
- **Inactive admins cannot log in**, and any existing token stops working
  immediately (role/active status is checked fresh on every request, never baked
  into the JWT).
- Lock-out guards: an owner cannot change their own role or deactivate
  themselves, and the last active owner cannot be demoted or deactivated.
- Any admin can change their own password from **Settings**.
- Sensitive admin actions (admin created / role changed / (de)activated /
  password reset, plus event & RSVP changes) are recorded to the `audit_logs`
  table.

---

## Project structure

```
RSVP60/
├── docker-compose.yml        # local Postgres + backend + frontend
├── backend/                  # FastAPI app
│   ├── Dockerfile
│   ├── alembic.ini           # Alembic config (DB URL comes from settings)
│   ├── migrations/           # Alembic env + versions/0001_… 0002_… 0003_admin_roles
│   ├── uploads/              # local flyer storage (git-ignored; local backend)
│   ├── app/
│   │   ├── main.py           # entrypoint: runtime validation, health, /media mount
│   │   ├── config.py         # env-driven settings (+ APP_ENV, storage, prod guards)
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # events, admins, invite_trees, rsvps, audit_logs
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # password hashing + JWT
│   │   ├── roles.py          # owner/admin/viewer role model + permissions
│   │   ├── storage.py        # pluggable flyer storage (local / supabase)
│   │   ├── deps.py           # auth + role dependencies + audit helper
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
| `STORAGE_BACKEND`                | `local`                       | `local` (files under `UPLOAD_DIR`, served from `/media`) or `supabase`. |
| `UPLOAD_DIR`                     | `uploads`                     | Local flyer directory (local backend), relative to the backend dir. |
| `MAX_UPLOAD_BYTES`               | `5242880`                     | Max flyer upload size in bytes (5 MB).                              |
| `MEDIA_BASE_URL`                 | _(empty)_                     | Absolute prefix for media URLs. Empty → app-relative `/media/...`. |
| `SUPABASE_URL`                   | _(empty)_                     | Supabase project URL (required when `STORAGE_BACKEND=supabase`).    |
| `SUPABASE_SERVICE_ROLE_KEY`      | _(empty)_                     | Supabase **service role** key — **server-only secret**, never exposed to the frontend. Required for the supabase backend. |
| `SUPABASE_STORAGE_BUCKET`        | `flyers`                      | Supabase Storage bucket name (create it as a **public** bucket).   |

When `STORAGE_BACKEND=supabase`, the app **refuses to boot** unless `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` are set. The API port is a uvicorn flag
(`--port 8010`), not an env var.

### Frontend (`frontend/.env.local`)

| Variable              | Default                 | Description                        |
| --------------------- | ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8010` | Base URL of the FastAPI backend.   |

---

## Demo credentials & invite links

After running `python -m app.seed`:

**Admin logins** (one per role)

| Email                | Password     | Role     |
| -------------------- | ------------ | -------- |
| `owner@rsvp60.com`   | `owner123`   | owner    |
| `admin@rsvp60.com`   | `admin123`   | admin    |
| `viewer@rsvp60.com`  | `viewer123`  | viewer   |

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
promotion seat validation, and per-event CSV export — plus the Phase 2
behaviours: event branding updates, flyer upload validation/serving/removal, the
readiness checklist, invite-token → correct-event scoping, and RSVP deadline
auto-close.

---

## Final local verification

Before shipping changes, run the full stack end to end on your machine. This is
the definitive "does everything still work together against Postgres" check.

**One command (Docker required):**

```bash
bash scripts/verify_local.sh      # or: make verify
```

It builds and starts the stack, waits for the backend to become healthy, seeds
demo data, then checks the backend health endpoint, a public invite token, the
frontend home page, admin login, and finally runs the smoke suite **inside the
backend container** against Postgres. It prints `PASS`/`FAIL` per check and
leaves the stack running so you can click around; exit code is non-zero if any
check fails.

**Or run the same flow manually** (documented ports: backend `8010`, frontend
`3005`, postgres `5432`):

```bash
# 1. Build & start everything (Postgres + FastAPI + Next.js)
docker compose up --build -d

# 2. Reset + seed demo data inside the backend container
docker compose exec backend python -m app.seed

# 3. Backend health
curl http://localhost:8010/health

# 4. Frontend is serving
curl -I http://localhost:3005

# 5. Public invite page resolves (never exposes the tree name)
curl http://localhost:8010/api/invites/fam-demo-token-000000000001

# 6. Admin login works
curl -X POST http://localhost:8010/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@rsvp60.com","password":"admin123"}'

# 7. Smoke tests against Postgres
docker compose exec backend python -m tests.smoke_test

# Tear down (add -v to also wipe the database volume)
docker compose down
```

---

## Continuous integration (CI)

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request
to `main` with three jobs:

- **Backend (PostgreSQL)** — spins up a `postgres:15` service, installs
  dependencies, applies Alembic migrations **against Postgres** (not just the
  SQLite dev DB), then proves the two production guards: the app refuses to boot
  in production with the insecure default `JWT_SECRET`, and `app.seed` refuses
  to run under `APP_ENV=production`. Finally it seeds a dev database, starts the
  API, and runs the smoke suite over HTTP.
- **Frontend** — `npm ci`, `npm run typecheck` (`tsc --noEmit`), lint if an
  ESLint config is present, and a real `next build`.
- **Docker** — validates `docker-compose.yml` with `docker compose config`. A
  full `docker compose up --build` is intentionally left as the manual
  [Final local verification](#final-local-verification) step rather than run in
  CI, to keep pipelines fast.

---

## Developer shortcuts (Makefile)

Common tasks are wrapped in a `Makefile` (run `make help` for the full list).
Requires `make` — on Windows use Git Bash + make, WSL, or run the underlying
commands directly.

| Command           | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `make migrate`    | Apply Alembic migrations                                    |
| `make seed`       | Reset + seed the database (destructive, dev only)           |
| `make test`       | Run backend smoke tests against a running API               |
| `make fe-check`   | Typecheck the frontend (`tsc --noEmit`)                     |
| `make fe-build`   | Production build of the frontend                            |
| `make up`         | `docker compose up --build`                                 |
| `make down`       | Stop the stack (keep the DB volume)                         |
| `make reset`      | Stop the stack and wipe the Postgres volume                 |
| `make verify`     | Guided end-to-end local verification                        |

---

## API reference

**Public**
- `GET  /health`, `GET /api/health`
- `GET  /api/invites/{token}` — invite payload (never includes the tree name)
- `POST /api/invites/{token}/rsvp` — submit/update an RSVP (rate limited)

**Admin** (require `Authorization: Bearer <token>`)
- `POST  /api/admin/login` · `GET /api/admin/me` · `PATCH /api/admin/me/password`
- `GET   /api/admin/admins` · `POST /api/admin/admins` (owner only)
- `PATCH /api/admin/admins/{id}` · `…/password` · `…/deactivate` · `…/reactivate` (owner only)
- `GET   /api/admin/events` · `POST /api/admin/events` · `GET|PATCH /api/admin/events/{id}`
- `POST  /api/admin/events/{id}/flyer` (multipart image) · `DELETE …/flyer`
- `GET   /api/admin/events/{id}/readiness` — pre-share checklist
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

**Flyer storage (production)**
- Set `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  and create a **public** Supabase Storage bucket matching
  `SUPABASE_STORAGE_BUCKET` (default `flyers`). Uploaded flyers are then served
  from Supabase and survive redeploys. The app refuses to boot in this mode
  until the URL and key are set.
- Keep `SUPABASE_SERVICE_ROLE_KEY` **server-side only** — it must never appear in
  the frontend or any `NEXT_PUBLIC_*` variable. Upload/delete happen only on the
  backend; guests only ever receive resolved public image URLs.
- The `local` backend is fine for a single always-on instance with persistent
  disk, but ephemeral/multi-instance hosts should use Supabase.

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
- **Roles**: owner/admin/viewer permissions are enforced server-side (viewers are
  read-only; only owners manage admins). Deactivated accounts are rejected at
  login and on every request, so revoking access is immediate. Passwords are
  never returned by any endpoint.
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

- Owners manage admin accounts in-app (`/admin/admins`); there is no **public**
  self-signup — accounts are always provisioned by an owner (or the dev seed).
- The RSVP rate limiter is **in-process** (fine for a single instance). Behind a
  multi-instance load balancer, use a shared store (e.g. Redis) instead.
- Duplicate protection is one RSVP per **phone number per event**; guests update
  their RSVP by re-submitting with the same phone number.
- No email/SMS notifications, QR **check-in** (QR **generation** for invite links
  is supported), public self-signup, or billing/multi-org features (intentionally
  out of scope for this phase).
- Flyer uploads use the **local** storage backend by default; those files live on
  the container disk (persisted via a Docker volume in dev). Use the **Supabase**
  storage backend in production so images survive redeploys and scale across
  instances.
- The frontend Docker image runs the Next.js **dev** server for local
  convenience; production frontend is expected to deploy to Vercel.
