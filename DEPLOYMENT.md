# GatherArc — Production Deployment & Operations

Practical guide for deploying GatherArc to **Vercel (frontend) + Render/Railway
(backend) + Supabase (Postgres + Storage) + Resend (email)**, plus the manual
integration checklists and recovery procedures.

> The application enforces its own production guards: on boot it **refuses to
> start** with an insecure `JWT_SECRET`, a localhost/blank `SITE_URL`, empty or
> localhost-only `CORS_ORIGINS`, or a live storage/email backend selected without
> credentials (see `backend/app/config.py::validate_runtime`). Run the config
> validator before deploying:
>
> ```bash
> cd backend
> APP_ENV=production python -m scripts.validate_prod_config   # masked summary + pass/fail
> ```

---

## 1. Recommended deployment order

1. **Supabase** — create the project (Postgres) and a **public** Storage bucket
   named `gatherarc-flyers` (must match `SUPABASE_STORAGE_BUCKET` exactly). Copy
   the connection string, project URL, and service-role key.
2. **Resend** — verify a sender domain/address, create an API key.
3. **Backend** (Render/Railway) — deploy with all env vars set (below). The start
   command applies migrations then serves. Confirm `/api/health` and `/api/ready`.
4. **Frontend** (Vercel) — set `NEXT_PUBLIC_API_URL` to the backend origin; deploy.
5. **Cross-wire** — set the backend's `SITE_URL` + `CORS_ORIGINS` to the Vercel
   origin and redeploy the backend. Create the first owner (see §7).
6. Run the **production smoke checklist** (§6).

### Controlled pilot go-live workflow (staging first)

Do a **pilot** pass in a dedicated staging project (name it *GatherArc Pilot* /
*GatherArc Staging*) with **synthetic data only** before treating the system as
production. Use the one-page gate in [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md).

1. Create/configure the pilot Supabase project (Postgres).
2. Configure the Supabase Storage `gatherarc-flyers` bucket (public); validate
   it with `python -m scripts.validate_storage --write-test`.
3. Configure and verify the Resend sender/domain.
4. Deploy the backend.
5. Apply Alembic migrations (`alembic upgrade head` — the start command does this).
6. Confirm `GET /api/health` → `200`.
7. Confirm `GET /api/ready` → `200`.
8. Bootstrap the first owner — `python -m app.bootstrap_owner` (§7).
9. Deploy the frontend (Vercel).
10. Cross-wire `SITE_URL`, `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the real origins.
11. Redeploy the affected services.
12. Log in as owner.
13. Create a synthetic pilot event through the UI (e.g. *GatherArc Pilot Celebration*).
14. Run the full pilot smoke scenario (§6 + the lifecycle in the phase brief).
15. Archive/remove the pilot records when validation is complete (§14).

---

## 2. Environment variables

Templates: `backend/.env.production.example`, `frontend/.env.production.example`.
Full table: see the main `README.md` → *Environment variables*.

**Backend (host dashboard — secrets are never committed):**

| Variable | Notes |
| --- | --- |
| `APP_ENV` | `production` (enables guards; disables dev auto-create) |
| `DATABASE_URL` | Supabase Postgres URL (`postgresql+psycopg2://…`) |
| `JWT_SECRET` | strong unique secret (`openssl rand -hex 32`) — Render can generate it |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | e.g. `720` |
| `SITE_URL` | the Vercel frontend origin (**https, not localhost**) |
| `CORS_ORIGINS` | the Vercel origin(s), comma-separated, no wildcard |
| `TRUST_PROXY_HEADERS` | `true` behind Render/Railway (see §5) |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | storage; **service-role key is server-only** |
| `EMAIL_BACKEND` | `resend` |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` / `RESEND_API_KEY` | email; **API key is server-only** |
| `EMAIL_TIMEOUT_SECONDS` | e.g. `10` |
| `SENTRY_DSN` | **optional** error tracking; blank → disabled. **Server-only** (never in the frontend); scrubbed of headers/bodies |
| `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` | env tag + sample rates (default `0.0`; errors still report) |

**Frontend (Vercel):** `NEXT_PUBLIC_API_URL` = backend origin; `NEXT_PUBLIC_SENTRY_DSN`
+ `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (optional client error tracking — a **public**
DSN, blank → disabled). All `NEXT_PUBLIC_*` values are public; no secrets.

**Never** place `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `JWT_SECRET` or the
**backend** `SENTRY_DSN` in any `NEXT_PUBLIC_*` variable or the frontend build.

---

## 3. Health & readiness

| Endpoint | Purpose | Use for |
| --- | --- | --- |
| `GET /api/health` (`/health`) | Liveness — process is up (no dependencies) | **Platform health check** |
| `GET /api/ready` (`/ready`) | Readiness — runs `SELECT 1` against the DB; `503` if unavailable | Load-balancer readiness / manual check |

Render/Railway configs point their health check at `/api/health`. Neither
endpoint exposes secrets or infrastructure detail.

---

## 4. Migrations & seeding

- Production schema is managed by **Alembic only**. The start command runs
  `alembic upgrade head` before serving; a failed migration aborts startup
  (the app never serves on a broken schema).
- **Never run `python -m app.seed` (or any reset) against production** — it is
  demo data and would create demo accounts/events. Seeding is for local/dev only
  and is intended to be blocked in production.

### Validate the full chain against PostgreSQL

Before trusting a Postgres/Supabase target, verify migrations `0001 → 0005` apply
cleanly (see §8 for the Supabase checklist). Locally you can validate against the
Compose Postgres:

```bash
docker compose up -d db
cd backend
DATABASE_URL="postgresql+psycopg2://rsvp60:rsvp60@localhost:5432/rsvp60" \
  python -m alembic upgrade head
DATABASE_URL="postgresql+psycopg2://rsvp60:rsvp60@localhost:5432/rsvp60" \
  python -m alembic current      # should show 0005_guest_comms
```

---

## 5. Reverse proxy & rate limiting

The RSVP and login rate limiters key on the client IP. Behind a platform proxy
(Render/Railway/Fly/LB) the socket peer is the proxy, so set
`TRUST_PROXY_HEADERS=true` to take the client IP from the **left-most**
`X-Forwarded-For` entry. When it is unset/`false`, only the direct socket peer is
used, so a client cannot spoof its IP with a forged header.

**Assumption:** exactly one trusted proxy sits in front of the app and sets
`X-Forwarded-For`. Do not enable it if the app is directly internet-exposed.

**Limitation:** both limiters are **in-process** (per instance). With multiple
backend instances the counters are per-instance; for strict global limits use a
shared store (e.g. Redis) — intentionally **not** added in this phase.

---

## 6. Production smoke checklist (post-deploy)

Use throwaway test records and delete them afterwards (see cleanup note).

1. `GET /api/health` → `200 {status:"ok"}`; `GET /api/ready` → `200 {status:"ready"}`.
2. Frontend loads at the Vercel URL.
3. Owner can log in (§7).
4. Viewer restrictions hold (viewer cannot mutate/send).
5. Create then edit a **test event**.
6. Create an **invite tree** (small allocation, e.g. 2 seats).
7. Open the **public invite** link — it must use the production domain, no tree name shown.
8. Submit an **accepted** RSVP (with an email + opt-in you control).
9. Submit a **waitlisted** RSVP (exceed the allocation).
10. **Confirmation email** is received; the waitlisted one says *not confirmed*.
11. **Flyer upload** resolves to a Supabase public URL; removal falls back cleanly.
12. **QR / WhatsApp** links use the production domain (not localhost/:port).
13. **Check-in** works (search/scan → check in).
14. **Audit** log and **communication** log record the actions.
15. **CSV export** and **manifest** render/download.

**Cleanup:** delete the test RSVPs (or the whole test event, which cascades to its
trees/RSVPs), remove any uploaded test flyer, and note that reminder/confirmation
emails only went to your own approved test address.

---

## 7. Creating the first owner (no seed in prod)

Since seeding is disabled in production, create the initial owner with the
**guarded bootstrap command** — no manual SQL, no seed, no table changes:

```bash
cd backend
# Interactive (password is prompted, hidden, and never echoed/logged):
python -m app.bootstrap_owner --email you@your-domain.com --name "Your Name"

# Non-interactive (CI/console) — value is visible in shell history, so rotate after:
BOOTSTRAP_OWNER_EMAIL=you@your-domain.com \
BOOTSTRAP_OWNER_NAME="Your Name" \
BOOTSTRAP_OWNER_PASSWORD='choose-a-strong-one' \
  python -m app.bootstrap_owner
```

It **creates an owner only when none exists**, refuses to overwrite an existing
owner or a taken email, enforces the password policy, hashes with the app's auth
system, writes an `owner_bootstrapped` audit record, and works on Postgres and
SQLite. Run it against the deployed database **after** migrations succeed. Rotate
the password after first login if it was supplied non-interactively. Do **not**
reuse demo credentials.

---

## 8. Supabase PostgreSQL — manual validation checklist

Run against a **non-production** Supabase database first (or a dedicated schema).
Never point destructive commands at live data.

- [ ] `alembic upgrade head` applies `0001 → 0005` with no errors.
- [ ] `alembic current` shows `0005_guest_comms`.
- [ ] String/UUID primary keys insert and join correctly (create an event → tree → RSVP).
- [ ] Unique indexes exist and are enforced:
  - [ ] `invite_trees.token` — duplicate token insert fails.
  - [ ] `rsvps.check_in_token` — duplicate token insert fails.
- [ ] `communication_logs` accepts inserts; `event_id`/`rsvp_id`/`status`/`created_at`
      indexes exist (`\d communication_logs` in psql).
- [ ] Event scoping holds: RSVPs/trees/logs for event A never surface under event B.
- [ ] `GET /api/ready` returns `200` against this database.
- [ ] First-owner bootstrap works — `python -m app.bootstrap_owner` creates the
      owner, then a second run **refuses** ("an owner already exists").
- [ ] Do **not** run `python -m app.seed` against this database — create pilot
      records through the app/admin UI after the first owner is provisioned.

---

## 9. Supabase Storage — manual smoke checklist

GatherArc flyer storage env (set on the **backend/Render only** — never Vercel):

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SERVER_SIDE_SECRET_KEY>
SUPABASE_STORAGE_BUCKET=gatherarc-flyers
```

- The bucket must **already exist**, be **public**, and its name must match
  `SUPABASE_STORAGE_BUCKET` **exactly** (a mismatch → `bucket_not_found`).
- The service-role key is a **server-only secret** — never expose it to the
  frontend or any `NEXT_PUBLIC_*` variable.
- Environment changes require a **backend redeploy** to take effect.

First, validate the configuration from the **Render Shell** (no real data touched):

```bash
python -m scripts.validate_storage               # confirms the bucket is reachable
python -m scripts.validate_storage --write-test  # uploads + deletes a probe object
```

Then use a dedicated **test event** so nothing touches real flyers:

- [ ] `validate_storage` (and `--write-test`) both pass.
- [ ] Bucket `gatherarc-flyers` exists and is **public** (matches the public-image design).
- [ ] Create an event **with a flyer in one step** (New event → choose flyer → Create)
      → the event is created, selected, and the flyer resolves.
- [ ] Upload a flyer on the test event → succeeds.
- [ ] The returned `flyer_image_url` is a Supabase public URL and loads in a browser.
- [ ] Replace the flyer → the new image resolves; the old object is overwritten/removed.
- [ ] Delete the flyer → `flyer_storage_path` clears; the **public invite** falls back
      cleanly (no broken image).
- [ ] Force a failure (e.g. wrong bucket name) → the backend log shows a **sanitized
      category** (`bucket_not_found`), the admin sees a safe actionable message, and
      the **service-role key never appears** in any log or response.
- [ ] Inspect the public invite payload and page source — the **service-role key
      never appears** in any browser-visible response.

---

## 10. Resend — manual smoke checklist

GatherArc email env (set on the **backend/Render only** — never Vercel):

```env
EMAIL_BACKEND=resend
EMAIL_FROM_ADDRESS=<VERIFIED_SENDER_ADDRESS>
EMAIL_FROM_NAME=GatherArc
RESEND_API_KEY=<SERVER_SIDE_SECRET>
EMAIL_TIMEOUT_SECONDS=10
```

- `EMAIL_BACKEND` must be **`resend`**, not `console` (console only *logs* — no
  delivery); the sender address/domain must be **verified** in Resend; env
  changes require a **backend redeploy**; the key never reaches the frontend.

First, validate from the **Render Shell** (masked; sends nothing unless asked):

```bash
python -m scripts.validate_email                          # config check
python -m scripts.validate_email --send-to you@approved.com  # one test email
```

Send **only** clearly-labelled test emails to an **approved test recipient**.
**Do not send bulk reminders** during validation.

- [ ] `validate_email` passes and (with `--send-to`) the test email arrives.
- [ ] Sender domain/address is verified in Resend; `EMAIL_FROM_ADDRESS` matches.
- [ ] `EMAIL_BACKEND=resend` (not `console`) and the config validator passes.
- [ ] Submit an opted-in **accepted** RSVP (your test address) → the confirmation
      **popup** shows only post-submission copy (no "Kindly RSVP"/deadline), and
      the communication log row is `sent` via the **`resend`** provider with a real
      `provider_message_id`.
- [ ] Re-submit the **same** RSVP → the log shows a `skipped` row (*Confirmation was
      already sent*), not a second delivery.
- [ ] Submit a **waitlisted** RSVP → the email wording says *on the waitlist / not
      yet confirmed* (never "confirmed").
- [ ] Temporarily set a **bad** API key → a send produces a `failed` log with a short
      safe reason (no key, no raw provider body). Restore the key.
- [ ] Reminder **preview** renders; a single reminder **send** to your test address works.
- [ ] Guest-facing emails show **no invite tree name** and **no check-in token**.

---

## 11. Observability

**Structured logs.** Console logs (stdout) cover: the startup mode/backends line
(including whether error tracking is on), config failures, email provider
failures, storage provider failures, notification-creation failures, and
unexpected API errors (via the global handler). Logs **never** contain JWT
secrets, passwords, service-role/Resend keys, or authorization headers. Ship
stdout to your platform's log drain.

**Error tracking (Sentry — optional).** Leave the DSNs blank to run without it.

- *Backend* — set `SENTRY_DSN` (+ optional `SENTRY_ENVIRONMENT`,
  `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`) on **Render only**.
  Unhandled server errors are reported, tagged with app/environment/route (and
  event id where bound). A `before_send` hook scrubs auth headers, cookies and
  request bodies, so tokens/API keys and guest form data never leave the process.
  The DSN is never returned by the API. `sentry-sdk` is imported lazily; if the
  DSN is unset or the package is missing, tracking is simply disabled.
- *Frontend* — set `NEXT_PUBLIC_SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_ENVIRONMENT`)
  on **Vercel**. This is a **public** ingest DSN (not the backend one). Only the
  error type, message, stack and route are sent — no breadcrumbs, no user
  identity, no guest PII. Implemented dependency-free (no SDK/webpack plugin), so
  the Next.js build is unaffected.
- *Testing it* — there is **no** public "throw a test error" endpoint by design.
  In a safe (non-prod) environment, set the DSN and exercise a real error path,
  then confirm the event appears in Sentry. Use `validate_prod_config` /
  `validate_storage` / `validate_email` to check config without side effects.

**Notification centre (in-app).** Operational events (failed emails, failed flyer
uploads, waitlisted guests, full invite trees, duplicate check-ins, admin
changes) are recorded in `admin_notifications` and surfaced to admins via the
workspace **bell** and the **/admin/notifications** page. This is the fastest way
for a host to notice a problem without reading platform logs. **Read state is a
single global `is_read` flag** (not per-admin) — marking read affects the shared
view. Notifications have no FKs to their entities, so they survive event/RSVP
deletion. There is **no** retention/pruning job yet — see §13.

---

## 12. Backup & recovery

- **Database backups** — Supabase provides automatic daily backups (retention
  depends on plan; Pro adds PITR). Verify your project's retention and, for extra
  safety, periodically `pg_dump` to off-site storage.
- **Storage** — Supabase Storage is not point-in-time; flyers are re-uploadable
  originals held by the host. Keep source flyer files, or periodically sync the
  bucket to another store if flyers are business-critical.
- **Data export** — admins can export guest data any time: **CSV** from the RSVPs
  page (`GET /api/admin/rsvps/export?event_id=…`) and the **guest manifest**
  (`GET /api/admin/guest-manifest?event_id=…`). Export before risky changes.
- **Application rollback** — redeploy the previous build/commit on Vercel and the
  backend host. Because migrations are additive, an app rollback usually needs no
  DB change; if a rollback is incompatible with a new column, roll the DB back with
  `alembic downgrade -1` (test the downgrade first).
- **Failed migration** — the app won't start (start command aborts on a failed
  `alembic upgrade head`). Fix forward with a corrected migration, or
  `alembic downgrade <prev>` then redeploy. Never hand-edit the production schema
  out-of-band; keep Alembic the source of truth.
- **Never** run seed/reset against production (§4).

---

## 13a. Pilot data cleanup

After a pilot/staging validation, clean up **synthetic** records safely — never
with a "delete everything" command:

- **Event** — set the pilot event's status to `archived` (or `closed`) from the
  Events page. It stops accepting RSVPs and drops out of the active workflow while
  its history is preserved.
- **Test admins** — deactivate them from the owner-only Admins page (they can no
  longer log in). Keep exactly one real owner.
- **Test flyer objects** — remove the flyer from the pilot event (Event → Remove
  flyer); for Supabase, confirm the object is gone in the bucket if storage tidiness
  matters.
- **Audit & communication logs** — retain by default (they are the record of what
  happened). Only purge under a deliberate data-retention policy.

**Not currently removable through the UI:** there is no hard-delete for events,
RSVPs, invite trees, or admins (deactivate/archive only, by design). If a pilot
project must be fully wiped, drop and recreate the *pilot* database at the
infrastructure level (Supabase) — never against production — then re-run
migrations and re-bootstrap the owner.

---

## 13. Known production limitations

- Rate limiting is in-process (per instance) — see §5.
- Email sends are synchronous (timeout-capped); no background queue/scheduler.
- Storage delete is best-effort; a failed delete leaves an orphaned object.
- Supabase Storage has no PITR — keep flyer originals.
- Notification **read state is global** (`is_read`), not per-admin: one admin
  marking a notification read clears it for everyone.
- Notifications are **not pruned** automatically — the `admin_notifications` table
  grows over time. Trim it under a deliberate retention policy if needed.
- Notification generation is **event-driven**: it fires from actions taken while
  the app is running. It does not back-fill signals for historical data, and
  purely-computed conditions (active-but-not-ready, RSVPs closed) live in the
  dashboard **Attention needed** panel rather than the persisted centre.
- Error tracking is **optional and best-effort**: with no DSN there is no external
  reporting (logs still capture failures). It reports errors, not audit events.
