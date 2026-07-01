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
  - [1. Backend (FastAPI)](#1-backend-fastapi--python)
  - [2. Frontend (Next.js)](#2-frontend-nextjs)
- [Environment variables](#environment-variables)
- [Demo credentials & invite links](#demo-credentials--invite-links)
- [API reference](#api-reference)
- [Deployment notes](#deployment-notes)
- [Known limitations](#known-limitations)

---

## Architecture & stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 15 (App Router) · TypeScript · Tailwind CSS · Recharts    |
| UI         | Hand-rolled shadcn/ui-style primitives, mobile-first              |
| Backend    | Python · FastAPI · SQLAlchemy 2.0                                  |
| Database   | PostgreSQL / Supabase (SQLite by default for zero-config local dev)|
| Auth       | JWT-based admin auth (PyJWT + passlib pbkdf2_sha256)              |

The **backend is the single source of truth** for all seat/quota logic — the
frontend only mirrors it for UX.

---

## Core concepts

### Events (first-class, multi-event)
Each event owns its invitation content (title, copy, flyer, venue, date/time,
dress code, gifts, RSVP deadline) and a lifecycle `status` (`draft`, `active`,
`closed`, `archived`). Public RSVPs are only accepted while an event is
`active` and before its `rsvp_deadline`.

### Invite trees (seat buckets)
An **invite tree** is a bucket of seats controlled by an admin, e.g. _Family:
50 seats_, _VIP: 15 seats_. Each tree has:

- allocated / used / remaining seats
- a plus-one rule (`max_extra_guests`: `0` = none, `1` = +1, `2` = +2)
- an `active` / `paused` status (plus a derived `exhausted` / `almost_full`)
- a **secure, random, URL-safe token** that forms the public invite link

Guests never see the tree name or who invited them — but every RSVP is linked
to the tree/token that brought them in.

### Seats, not people
- Guest alone = **1 seat** · Guest +1 = **2 seats** · Guest +2 = **3 seats**
- The RSVP form only offers options allowed by **both** the tree's plus-one rule
  **and** the remaining capacity.

### Waitlist (no hard blocking)
If an RSVP would exceed a tree's remaining seats it is saved as **waitlisted**
(seats not counted) with a polite message. Otherwise it is **accepted** and the
seats are counted. Admins can manually set any RSVP to
`accepted` / `declined` / `waitlisted` / `cancelled`; promoting to `accepted`
re-validates seat availability.

---

## Project structure

```
RSVP60/
├── backend/                  # FastAPI app
│   ├── app/
│   │   ├── main.py           # app entrypoint + CORS + table auto-create
│   │   ├── config.py         # env-driven settings
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # events, admins, invite_trees, rsvps, audit_logs
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # password hashing + JWT
│   │   ├── deps.py           # auth dependency + audit helper
│   │   ├── seat_logic.py     # all seat/quota/waitlist rules
│   │   ├── seed.py           # dev seed data (2 events)
│   │   └── routers/
│   │       ├── public.py     # GET/POST invite endpoints
│   │       └── admin.py      # events, trees, rsvps, dashboard, export
│   ├── schema.sql            # canonical Postgres schema
│   ├── requirements.txt
│   └── .env.example
└── frontend/                 # Next.js app
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx               # landing
    │   │   ├── invite/[token]/        # public invite + RSVP page
    │   │   └── admin/                 # dashboard, events, invite-trees, rsvps, settings, login
    │   ├── components/
    │   │   ├── ui/                    # button, card, input, badge, ...
    │   │   ├── invite/RsvpForm.tsx
    │   │   └── admin/                 # charts, event switcher/context, forms
    │   └── lib/                       # api client, types, utils, calendar
    └── .env.local.example
```

---

## Running locally

**Prerequisites:** Python 3.11+, Node.js 18+ (tested on 22/24).

### 1. Backend (FastAPI + Python)

```bash
cd backend
python -m venv .venv

# Activate the venv:
#   Windows (PowerShell):  .venv\Scripts\Activate.ps1
#   Windows (Git Bash):    source .venv/Scripts/activate
#   macOS/Linux:           source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # (Windows: copy .env.example .env)

# Seed the database (creates tables + demo data). DESTRUCTIVE: drops tables.
python -m app.seed

# Run the API (http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: **http://localhost:8000/docs**

> By default the backend uses a local **SQLite** file (`rsvp60.db`) so it runs
> with zero setup. To use **PostgreSQL/Supabase**, set `DATABASE_URL` in `.env`
> (see below) and re-run the seed. The `schema.sql` file is the canonical
> Postgres migration if you prefer to create tables manually.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local   # (Windows: copy .env.local.example .env.local)

# Ensure NEXT_PUBLIC_API_URL points at the backend (default http://localhost:8000)
npm run dev                         # http://localhost:3000
```

Then open:

- **Admin:** http://localhost:3000/admin  → log in with the demo credentials
- **Public invite:** copy an invite link from *Admin → Invite Trees*, or use a
  demo token below.

---

## Environment variables

### Backend (`backend/.env`)

| Variable                      | Default                          | Description                                        |
| ----------------------------- | -------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`                | `sqlite:///./rsvp60.db`          | SQLAlchemy URL. Use `postgresql+psycopg2://...` for Supabase/Postgres. |
| `JWT_SECRET`                  | `dev-super-secret-change-me`     | **Change in production.** Signs admin JWTs.        |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720`                            | Admin session lifetime.                            |
| `SITE_URL`                    | `http://localhost:3000`          | Frontend origin; used to build shareable invite links. |
| `CORS_ORIGINS`                | `http://localhost:3000,...`      | Comma-separated allowed origins.                   |

### Frontend (`frontend/.env.local`)

| Variable              | Default                 | Description                        |
| --------------------- | ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the FastAPI backend.   |

---

## Demo credentials & invite links

After running `python -m app.seed`:

**Admin logins** (any of these):

| Email               | Password     |
| ------------------- | ------------ |
| `admin@rsvp60.com`  | `admin123`   |
| `host@rsvp60.com`   | `host1234`   |
| `planner@rsvp60.com`| `planner123` |

**Seeded events**
- _Chief Emmanuel Adeyemi's 60th Birthday Celebration_ (birthday) — 4 invite trees
- _Tolu & Bisi's Wedding_ (wedding) — 2 invite trees

**Demo invite links** (open at `/invite/<token>`):

| Tree             | Path                                             |
| ---------------- | ------------------------------------------------ |
| Family (+1)      | `/invite/fam-demo-token-000000000001`            |
| Church Friends   | `/invite/church-demo-token-00000000002`          |
| Work Friends (+1)| `/invite/work-demo-token-0000000000003`          |
| VIP Guests (+2)  | `/invite/vip-demo-token-00000000000004` (full → waitlist) |
| Bride's Family   | `/invite/wed-bride-token-00000000000005`         |
| Couple's Friends | `/invite/wed-friends-token-0000000000006`        |

> Real invite tokens created via the admin UI are cryptographically random.

---

## API reference

**Public**
- `GET  /api/invites/{token}` — invite payload (never includes the tree name)
- `POST /api/invites/{token}/rsvp` — submit/update an RSVP

**Admin** (require `Authorization: Bearer <token>`)
- `POST  /api/admin/login`
- `GET   /api/admin/me`
- `GET   /api/admin/events` · `POST /api/admin/events` · `GET|PATCH /api/admin/events/{id}`
- `GET   /api/admin/invite-trees?event_id=…` · `POST /api/admin/invite-trees` · `PATCH /api/admin/invite-trees/{id}`
- `GET   /api/admin/rsvps?event_id=…` (filters: `status`, `invite_tree_id`, `search`)
- `PATCH /api/admin/rsvps/{id}`
- `GET   /api/admin/rsvps/export?event_id=…` — CSV
- `GET   /api/admin/dashboard/summary?event_id=…`
- `GET   /api/admin/dashboard/charts?event_id=…`

---

## Deployment notes

- **Frontend → Vercel:** set `NEXT_PUBLIC_API_URL` to the deployed API URL.
- **Backend → Render / Railway / Fly.io:** start with
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; set `DATABASE_URL`,
  `JWT_SECRET`, `SITE_URL`, `CORS_ORIGINS`.
- **Database → Supabase:** create the project, copy the connection string into
  `DATABASE_URL`, run `schema.sql` (or let the app auto-create tables on boot),
  then seed/create your first event via the admin UI.

---

## Known limitations

- Admin accounts are provisioned via the seed script — there is no admin
  self-signup or in-app user management UI (MVP scope).
- Tables are auto-created on startup for convenience; a production setup should
  use a real migration tool (Alembic) and disable auto-create.
- Duplicate protection is one RSVP per **phone number per event**; guests update
  their RSVP by re-submitting with the same phone number.
- No email/SMS notifications, no file upload for flyers (flyer is a URL), and no
  billing/subscriptions/multi-org features (intentionally out of scope).
- `flyer_url` is rendered via a plain `<img>` for host flexibility (no image
  optimization pipeline).
