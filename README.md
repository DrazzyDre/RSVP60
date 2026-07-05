# GatherArc

**From invite to arrival.** A mobile-first platform for **invitations, RSVPs,
guest communications, and event-day operations**. Guests open a private, secure
invite link, view a beautiful invitation, and RSVP (with an optional plus-one /
plus-two depending on their link). Admins manage everything from a private
dashboard.

Although the first seeded event is a **60th birthday celebration**, GatherArc is
built as a **reusable, multi-event platform** — the same code powers birthdays,
weddings, funerals, memorials, anniversaries, church events, dinners,
conferences and other private gatherings. Admins can create multiple events and
switch between them; every invite tree, RSVP, seat count and chart is scoped to
a single event.

> Formerly **RSVP60** — the product was renamed to **GatherArc** to reflect its
> broader, event-agnostic architecture. Some internal technical identifiers
> (local database name, Docker service creds) intentionally retain the old name.

---

## Table of contents

- [Architecture & stack](#architecture--stack)
- [Core concepts](#core-concepts)
- [Invite presentation & sharing](#invite-presentation--sharing)
- [Flyer uploads & storage](#flyer-uploads--storage)
- [Admin roles & management](#admin-roles--management)
- [Account security & audit log](#account-security--audit-log)
- [Event-day check-in & manifest](#event-day-check-in--manifest)
- [Guest communications (email)](#guest-communications-email)
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

GatherArc renders each public invite entirely from **event data** — there is no
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
  Storage whose name **exactly matches** `SUPABASE_STORAGE_BUCKET` (GatherArc
  default `gatherarc-flyers`) — a mismatch surfaces as a `bucket_not_found`
  upload failure. The app refuses to boot in this mode until the URL and key are
  provided. Changing storage env vars requires a **backend redeploy**. Validate
  before going live with `python -m scripts.validate_storage [--write-test]`
  (see below). Upload failures are logged with a **sanitized category**
  (`bucket_not_found`, `storage_authentication_failed`, …) — never the
  service-role key or raw provider response.

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

## Account security & audit log

- **Login rate limiting** — repeated *failed* admin sign-ins are throttled per
  client IP + email. After `LOGIN_RATE_LIMIT_MAX_FAILURES` failures (default 5)
  within `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (default 300s) the endpoint returns a
  friendly `429` with `Retry-After`. Only failures count and a successful
  sign-in clears the counter, so normal logins and authenticated API usage are
  never throttled. Like the RSVP limiter it is **in-process** — use a shared
  store (Redis) behind a multi-instance load balancer.
- **Password policy** — admin creation, owner password reset and self password
  change require a password that is at least 8 characters, not blank/whitespace,
  and not an obviously weak one (e.g. `password`, `admin123`, `12345678`). It is
  intentionally minimal — not a full enterprise policy. (The dev seed sets its
  demo passwords directly, bypassing the policy.)
- **Audit log viewer** — owners can review recorded actions at **`/admin/audit`**
  (`GET /api/admin/audit-logs`, owner-only). Filter by action, admin, entity
  type and date range. Metadata is summarized and any value under a
  sensitive-looking key (password/secret/token/hash/key) is redacted — the app
  never logs secrets, and this guarantees it.

---

## Event-day check-in & manifest

Tools for running the actual event, all scoped to the selected event.

- **Check-in** (`/admin/check-in`) — a fast, tablet/phone-friendly page. Search by
  name/phone/email (or open the accepted roster), then check a guest in.
  - **Seats, not people:** check-in records `checked_in_seats`, defaulting to the
    RSVP's `seats_requested`. If a "Me +1" guest arrives alone, set it to 1.
    Checked-in seats are bounded to `1..seats_requested`.
  - Only **accepted** RSVPs are eligible; waitlisted/declined/cancelled guests
    show a warning and can't be checked in until an editor changes their status.
  - Duplicate check-in is prevented; check-in records **when** and **who**.
    Editors (owner/admin) can undo or adjust seats; **viewers can view but not
    perform check-in** (enforced on the backend).
  - **Quick filters** (All / Not checked in / Checked in / Issues) with live
    counts, large tap targets, a one-tap **clear** button, and clear
    already-checked-in / not-eligible warnings make door use fast on a phone.
  - **Race-safe:** check-in flips `checked_in_at` in a single guarded
    `UPDATE … WHERE checked_in_at IS NULL`, so two admins tapping *Check in* at
    the same instant can't both succeed — the second reliably gets a friendly
    409 and the original record (who/when/seats) is never overwritten. Portable
    across SQLite and PostgreSQL.
  - **Offline aware:** an *Offline* banner appears when the browser loses its
    connection and check-in actions are disabled until it returns; a manifest
    already loaded stays viewable/printable.
- **In-app QR scanner** — a **Scan** button opens the device camera and reads a
  guest's check-in QR directly on the check-in page (decoded locally in the
  browser). It extracts the `check_in_token`, loads the guest and lets an
  owner/admin check them in. Unknown/invalid codes show a friendly message, and
  if the camera is unavailable or blocked it falls back to a manual token/link
  entry. The scanner is behind admin login — **guests still can't self-check-in**.
- **Guest QR codes** — each RSVP has a random `check_in_token` (never a database
  id). Its QR encodes `/admin/check-in?token=…`, so scanning it on the (login-
  protected) check-in page jumps straight to that guest. View / download PNG·SVG
  / copy from the check-in card.
- **Guest manifest** (`/admin/manifest`) — a print-friendly door list grouped by
  invite tree, with per-tree totals (guests / confirmed seats / checked-in seats)
  and grand totals (confirmed / checked-in / waitlisted seats). Shows a **generated
  timestamp**, clear checked-in / *not in* indicators, and a **Compact** toggle for
  denser printing. A **Print** button produces a clean sheet (the app chrome is
  hidden on print). Full guest data is also downloadable as **CSV** from the RSVPs
  page (including checked-in columns).
- **RSVP list** shows a **Check-in** column/indicator — a checked-in badge with
  seats and timestamp — so status is visible without opening the check-in page.
- **Dashboard** gains an *Event-day check-in* card row: checked-in guests,
  checked-in seats, not-yet-checked-in, and check-in rate.

All check-in endpoints are admin-protected — **guests cannot check themselves in**.

---

## Guest communications (email)

Consent-aware, provider-agnostic transactional email. Everything is a **best-effort
side effect** — a delivery failure can never roll back an RSVP, a check-in or an
admin action.

### Email backend

Chosen by `EMAIL_BACKEND`:

- **`console`** (default) — messages are logged, never sent. No credentials, no
  network. This is what local dev, the test suite and CI use.
- **`resend`** — transactional email via [Resend](https://resend.com), called over
  plain HTTPS (no vendor SDK). Requires `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS`.

The provider lives behind a small abstraction (`app/email/`) — routers call
`service.send_*` functions and never touch a vendor. In **production** the app
refuses to boot if a live provider is selected but its credentials are missing.
The API key is server-only: never sent to the frontend, never returned by the
API, never written to the communication log.

> **Live delivery gotcha:** if `EMAIL_BACKEND` is left as `console` in
> production, confirmations/reminders are only *logged*, never delivered — the
> Communications log shows them as `sent` via the **`console`** provider.
> Validate the live config (and optionally send one test email) with:
>
> ```bash
> cd backend
> python -m scripts.validate_email                       # read-only config check
> python -m scripts.validate_email --send-to me@you.com  # send ONE test email
> ```
>
> It prints a masked summary (never the API key), warns when production is still
> on `console`, and exits non-zero on a real misconfiguration or failed send.
> Delivery outcomes are recorded per-message with a **provider**, a sanitized
> **skip/failure reason** (e.g. *Guest did not opt in*, *Sender address or domain
> is not verified*) and a `provider_message_id` — visible on the admin
> Communications page.

### Consent

Guests are never emailed without **both** an address **and** an explicit opt-in:

> Receive RSVP confirmation and important updates about this event.

The RSVP form shows this checkbox (only active once an email is typed). No email,
or no consent → nothing is sent (a "skipped" row is recorded when consent is
absent so admins can see why). No marketing, ever.

### What gets sent

- **RSVP confirmation** — on submit/update, reflecting the *actual* outcome. A
  waitlisted guest is told they are **on the waitlist / not yet confirmed** — never
  that they're confirmed.
- **Status-update** — optional email when an editor changes a status. An RSVPs-page
  **"Notify guest on status change"** toggle makes the choice explicit; an unchanged
  status never sends a duplicate.
- **Event reminder** — a manual, admin-triggered bulk send to **accepted + opted-in**
  guests only (declined/cancelled/waitlisted are excluded; checked-in guests can be
  excluded too). Preview the audience and the rendered email first; a repeat send is
  guarded (409 → explicit resend confirmation).
- **Check-in acknowledgement** — an optional "you're checked in" email, sent once.
- **Host alerts** — configurable per event (`host_notification_email`): invite
  allocation exhausted, a guest waitlisted, and bulk-reminder completion.
  Exhausted-tree alerts are **de-duplicated** so they don't repeat for the same state.

Guest-facing emails are event-branded (title, host, accent colour), escape all
guest-provided text, and **never** include invite tree names or check-in tokens.

### Communications console (`/admin/communications`)

Shows the email backend status, the reminder audience with counts, a live email
preview (sandboxed), the manual **send reminder** action (owner/admin), and a
recent delivery log. **Viewers can view but cannot send or resend.** Every attempt
is recorded in a dedicated `communication_logs` table (type, recipient, status,
provider, `provider_message_id`, short sanitized error) — no secrets, no message
bodies, no full provider responses.

---

## Project structure

```
gatherarc/
├── docker-compose.yml        # local Postgres + backend + frontend
├── backend/                  # FastAPI app
│   ├── Dockerfile
│   ├── alembic.ini           # Alembic config (DB URL comes from settings)
│   ├── migrations/           # Alembic env + versions/0001…0005_guest_communications
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
| `LOGIN_RATE_LIMIT_MAX_FAILURES`  | `5`                           | Failed admin logins (per IP+email) before a `429` block.           |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS`| `300`                         | Window for counting failed logins, in seconds.                     |
| `TRUST_PROXY_HEADERS`            | `false`                       | Trust `X-Forwarded-For` for the client IP. Enable **only** behind a trusted proxy (Render/Railway/LB). |
| `STORAGE_BACKEND`                | `local`                       | `local` (files under `UPLOAD_DIR`, served from `/media`) or `supabase`. |
| `UPLOAD_DIR`                     | `uploads`                     | Local flyer directory (local backend), relative to the backend dir. |
| `MAX_UPLOAD_BYTES`               | `5242880`                     | Max flyer upload size in bytes (5 MB).                              |
| `MEDIA_BASE_URL`                 | _(empty)_                     | Absolute prefix for media URLs. Empty → app-relative `/media/...`. |
| `SUPABASE_URL`                   | _(empty)_                     | Supabase project URL (required when `STORAGE_BACKEND=supabase`).    |
| `SUPABASE_SERVICE_ROLE_KEY`      | _(empty)_                     | Supabase **service role** key — **server-only secret**, never exposed to the frontend. Required for the supabase backend. |
| `SUPABASE_STORAGE_BUCKET`        | `gatherarc-flyers`            | Supabase Storage bucket name — must **exactly match** an existing **public** bucket. |
| `EMAIL_BACKEND`                  | `console`                     | `console` (log only, default) or `resend` (live transactional email). |
| `EMAIL_FROM_ADDRESS`             | _(empty)_                     | From-address for outgoing mail. Required for a live provider.       |
| `EMAIL_FROM_NAME`                | `GatherArc`                   | Display name on outgoing mail.                                      |
| `RESEND_API_KEY`                 | _(empty)_                     | Resend API key — **server-only secret**, never exposed to the frontend, never logged. Required when `EMAIL_BACKEND=resend`. |
| `EMAIL_TIMEOUT_SECONDS`          | `10`                          | Hard cap on a single synchronous provider send.                    |

**Production fail-fast guards.** On boot (`validate_runtime`) the app **refuses to
start** in production (`APP_ENV=production`) when: `JWT_SECRET` is the dev default;
`SITE_URL` is blank or localhost (it builds invite/QR/email links); `CORS_ORIGINS`
is empty, a wildcard, or localhost-only; `STORAGE_BACKEND=supabase` is missing
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`; or a live `EMAIL_BACKEND` (e.g.
`resend`) is missing its credentials. Validate your config before deploying:

```bash
cd backend
APP_ENV=production python -m scripts.validate_prod_config   # masked summary + pass/fail
```

**Validate flyer storage** separately (confirms the bucket exists / is reachable
with the current credentials, before the first real upload):

```bash
cd backend
python -m scripts.validate_storage               # read-only reachability check
python -m scripts.validate_storage --write-test  # also upload + delete a probe object
```

It prints only masked summaries (never the service-role key) and exits non-zero
on the first failure, naming the sanitized category (e.g. `bucket_not_found`).

**Validate email delivery** (confirms the backend + credentials, warns on a
`console` backend in production, and optionally sends one test email):

```bash
cd backend
python -m scripts.validate_email                       # read-only config check
python -m scripts.validate_email --send-to me@you.com  # send ONE test email
```

No email is sent without an explicit `--send-to` recipient; the API key is never
printed.

The API port is a uvicorn flag (`--port 8010` / `$PORT`), not an env var. See
**[DEPLOYMENT.md](DEPLOYMENT.md)** for the full production guide.

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
| `owner@gatherarc.com`   | `owner123`   | owner    |
| `admin@gatherarc.com`   | `admin123`   | admin    |
| `viewer@gatherarc.com`  | `viewer123`  | viewer   |

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
promotion seat validation, and per-event CSV export — plus later phases: event
branding/flyer upload/readiness/deadline auto-close (Phase 2); admin
roles/management (Phase 3); login rate limiting, password policy and audit
access (Phase 3.5); event-day check-in, seat-bounded check-in, and the guest
manifest (Phase 4); race-safe check-in and door operations (Phase 4.5); and
guest communications — consent-gated confirmations, notify-on-status-change,
event-scoped reminders, host-alert de-duplication and no-secret comms logs
(Phase 5).

Two focused unit suites (standard-library `unittest`, no live services) round
this out:

```bash
cd backend
python -m unittest tests.test_email     # email templates + service (mocked provider)
python -m unittest tests.test_storage   # flyer storage abstraction
```

Both the smoke suite and CI run with `EMAIL_BACKEND=console`, so **no real email
is ever sent** during testing.

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
  -d '{"email":"admin@gatherarc.com","password":"admin123"}'

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
- `GET  /health`, `GET /api/health` — liveness (process up); use for the platform health check
- `GET  /ready`, `GET /api/ready` — readiness (DB connectivity; `503` when the database is unreachable)
- `GET  /api/invites/{token}` — invite payload (never includes the tree name)
- `POST /api/invites/{token}/rsvp` — submit/update an RSVP (rate limited)

**Admin** (require `Authorization: Bearer <token>`)
- `POST  /api/admin/login` · `GET /api/admin/me` · `PATCH /api/admin/me/password`
- `GET   /api/admin/admins` · `POST /api/admin/admins` (owner only)
- `PATCH /api/admin/admins/{id}` · `…/password` · `…/deactivate` · `…/reactivate` (owner only)
- `GET   /api/admin/audit-logs` (owner only; filters: action, admin_id, entity_type, since, until, limit, offset)
- `GET   /api/admin/events` · `POST /api/admin/events` · `GET|PATCH /api/admin/events/{id}`
- `POST  /api/admin/events/{id}/flyer` (multipart image) · `DELETE …/flyer`
- `GET   /api/admin/events/{id}/readiness` — pre-share checklist
- `GET   /api/admin/invite-trees?event_id=…` · `POST` · `PATCH /api/admin/invite-trees/{id}`
- `GET   /api/admin/rsvps?event_id=…` (filters: `status`, `invite_tree_id`, `search`)
- `PATCH /api/admin/rsvps/{id}` (optional `?notify=true` emails the guest on a status change)
- `POST  /api/admin/rsvps/{id}/resend-confirmation` (editor)
- `GET   /api/admin/rsvps/export?event_id=…` — CSV (with checked-in columns)
- `GET   /api/admin/check-in/search?event_id=…` (`q` or `token`; any active admin)
- `POST  /api/admin/rsvps/{id}/check-in` · `…/undo-check-in` · `PATCH …/checked-in-seats` (editor)
- `GET   /api/admin/guest-manifest?event_id=…` — per-tree + grand totals (any active admin)
- `GET   /api/admin/dashboard/summary?event_id=…` · `GET /api/admin/dashboard/charts?event_id=…`
- `GET   /api/admin/communications/status?event_id=…` — email backend + audience + recent log (any active admin)
- `GET   /api/admin/communications/reminder/preview?event_id=…&exclude_checked_in=…` — audience + rendered preview
- `POST  /api/admin/communications/reminder/send?event_id=…` — bulk reminder (editor; `confirm_resend` guards repeats)
- `GET   /api/admin/communications/logs?event_id=…` — event-scoped delivery log (any active admin)

---

## Deployment notes

A typical production layout: **Vercel** (frontend) + **Render/Railway/Fly.io**
(backend) + **Supabase** (Postgres + Storage) + **Resend** (email). A full guide —
env reference, live-integration checklists (Postgres/Storage/Resend), a
post-deploy smoke checklist, and backup/rollback procedures — lives in
**[DEPLOYMENT.md](DEPLOYMENT.md)**, with a one-page launch gate in
**[GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md)**. Ready-made config:
**`render.yaml`** (Render blueprint), **`backend/railway.json`** (Railway), and
**`backend/scripts/start.sh`** (migrate-then-serve start command).

**Supabase (database)**
1. Create a project and copy the connection string.
2. Set it as `DATABASE_URL` on the backend host (`postgresql+psycopg2://...`).
3. Schema is applied by `alembic upgrade head` on deploy (do **not** rely on
   auto-create in production).

**Backend (Render / Railway / Fly.io)**
- Build: `pip install -r requirements.txt`
- Start (migrate then serve): `bash scripts/start.sh` — runs `alembic upgrade head`
  then `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and fails fast if a
  migration fails (never serves on a broken schema).
- Health check: point the platform at `GET /api/health`. `GET /api/ready` adds a
  DB connectivity check (`503` when the database is unreachable).
- Env: `APP_ENV=production`, a strong `JWT_SECRET` (`openssl rand -hex 32`),
  `DATABASE_URL`, `SITE_URL` (your frontend URL), `CORS_ORIGINS` (your frontend
  origin(s)), and `TRUST_PROXY_HEADERS=true` (behind the platform proxy). The app
  **refuses to boot** in production with an unsafe secret or localhost/blank
  `SITE_URL`/`CORS_ORIGINS`. Verify first: `python -m scripts.validate_prod_config`.
- Do **not** run `app.seed` against production; create your first event via the
  admin UI. Provision the first owner with the guarded bootstrap command
  **`python -m app.bootstrap_owner`** (creates an owner only when none exists,
  never overwrites, no seed/SQL — see DEPLOYMENT.md §7).

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
- **Login throttling**: repeated failed admin logins (per IP+email) are blocked
  with a `429` to slow brute force; successful logins and normal API calls are
  unaffected.
- **Password policy**: admin passwords must be ≥8 chars, non-blank, and not an
  obviously weak one.
- **Audit log**: owner-only viewer over recorded admin actions; metadata is
  redacted of any sensitive-looking values.
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
- The RSVP **and** admin-login rate limiters are **in-process** (fine for a
  single instance). Behind a multi-instance load balancer, use a shared store
  (e.g. Redis) instead, or the per-instance counters can be bypassed.
- The password policy is intentionally minimal (length + blocklist); there is no
  breach-list check, rotation, or history. Password resets are owner-driven —
  there is no email-based self-service reset (out of scope for this phase).
- Check-in is **admin-driven** — an admin scans/searches and taps check in; there
  is no self-serve guest kiosk or hardware scanner integration (the guest QR just
  deep-links the admin check-in page). Check-in counts seats, not identities, and
  does not enforce tree capacity at the door.
- Duplicate protection is one RSVP per **phone number per event**; guests update
  their RSVP by re-submitting with the same phone number.
- **Email** is transactional-only and consent-gated (Phase 5). Sends are
  **synchronous** with a timeout (fine for one-off confirmations and modest
  reminder batches) — there is **no background scheduler/queue**; reminders are a
  deliberate manual admin action. There is no SMS, no automated WhatsApp, no
  open/click/bounce tracking, and no self-service password reset. The
  exhausted-tree host alert fires **once per tree** (it does not re-arm if the
  tree frees up and fills again). No public self-signup or billing/multi-org
  features (intentionally out of scope).
- Flyer uploads use the **local** storage backend by default; those files live on
  the container disk (persisted via a Docker volume in dev). Use the **Supabase**
  storage backend in production so images survive redeploys and scale across
  instances.
- The frontend Docker image runs the Next.js **dev** server for local
  convenience; production frontend is expected to deploy to Vercel.
