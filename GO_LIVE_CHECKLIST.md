# RSVP60 — Go-Live Checklist

A concise, tick-through checklist for a **controlled pilot / production launch**.
Full procedures live in [`DEPLOYMENT.md`](./DEPLOYMENT.md); this is the one-page
gate. Do a **pilot** (staging) pass first with synthetic data, then repeat for
the real event. Never validate with real guest data or send bulk email in a test.

## Infrastructure

- [ ] Custom domain configured (frontend and, if used, backend)
- [ ] HTTPS active on both origins (required for the check-in camera/scanner)
- [ ] Database reachable — `GET /api/ready` returns `200 {"status":"ready"}`
- [ ] Migrations current — `alembic current` shows the latest revision (`0005_guest_comms`)
- [ ] Supabase Storage `flyers` bucket exists and is **public**
- [ ] Resend sending domain/sender verified; `EMAIL_FROM_ADDRESS` matches
- [ ] Health check wired to `/api/health`; readiness to `/api/ready`

## Security

- [ ] Strong, unique `JWT_SECRET` (`openssl rand -hex 32`) — not the dev default
- [ ] No demo/seed accounts in the database (no `owner@rsvp60.com` etc.)
- [ ] First owner provisioned via `python -m app.bootstrap_owner` (no seed/manual SQL)
- [ ] `CORS_ORIGINS` is the explicit frontend origin(s) — **no wildcard**, no localhost
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are backend-only (never `NEXT_PUBLIC_*`)
- [ ] Production guards pass — `APP_ENV=production python -m scripts.validate_prod_config`
- [ ] `TRUST_PROXY_HEADERS=true` only because exactly one trusted proxy sits in front
- [ ] owner / admin / viewer permissions spot-checked (viewer is read-only)

## Product

- [ ] Event created through the UI; readiness checklist completed
- [ ] Flyer uploads and displays; removal falls back cleanly
- [ ] Invite links open the public invite on the **production domain** (no tree name shown)
- [ ] RSVP tested: accepted, +1, declined, and waitlisted (fill a small allocation)
- [ ] Confirmation emails received; waitlisted email says *not yet confirmed*
- [ ] Check-in tested **on a real mobile device over HTTPS** (QR scan + manual token)
- [ ] Manifest renders/prints; CSV export includes check-in data

## Operations

- [ ] Backups understood (Supabase daily backups / PITR per plan; keep flyer originals)
- [ ] Rollback documented (redeploy prior build; migrations are additive)
- [ ] Event-day contact person identified
- [ ] Venue internet plan considered; **printed manifest** available as fallback
- [ ] Admin/owner credentials stored securely (password manager)
- [ ] Pilot records archived/removed after validation (see DEPLOYMENT.md §14)

---

**Readiness verdict:** the launch is go when every box above is ticked for the
real event and the automated suites (backend smoke, config/email/storage/bootstrap
unit tests, frontend typecheck + build) are green.
