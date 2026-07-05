"""GatherArc backend smoke tests.

Exercises the real HTTP API against whatever database the server is running on
(SQLite or PostgreSQL). Run the API with a freshly seeded database, then:

    python -m tests.smoke_test                 # BASE_URL defaults to :8010

Verifies (per Phase 1.5 goal 5):
  * event scoping across multiple events
  * invite tree scoping
  * secure invite token resolution (+ 404 on bad token)
  * no invite tree name leak on the public invite endpoint
  * duplicate RSVP by phone per event
  * updating a duplicate RSVP releases / recalculates seats correctly
  * accepted RSVP counts against used seats
  * waitlisted RSVP does NOT count against used seats
  * admin promotion waitlisted -> accepted validates available seats
  * CSV export is scoped per event

Phase 2 additions:
  * event branding update (headline / message / theme) persists + coerces bad themes
  * flyer upload accepts images, rejects non-images, serves + removes the file
  * public invite exposes the resolved flyer image and theme, still hides tree name
  * readiness checklist endpoint (scoped to the event)
  * invite token resolves to the correct event (share/QR scoping)
  * RSVP deadline auto-close behaviour (auto_close_rsvp on/off)

Phase 3 additions (admin roles + management):
  * owner-only admin listing/creation; admin & viewer are refused (403)
  * role change, deactivate/reactivate, inactive admins cannot log in
  * owner self-lockout guards (own role / self-deactivation)
  * viewers are read-only (cannot mutate events/trees/RSVPs) but can export

Phase 3.5 additions (account security + audit):
  * weak passwords are rejected on admin creation
  * owner-only audit log; admin/viewer/anon are refused; no secrets exposed
  * failed admin logins are rate-limited (429) without blocking valid sign-ins

Phase 4 additions (event-day check-in + manifest):
  * accepted guests can be checked in; waitlisted/declined cannot
  * duplicate check-in blocked; checked-in seats bounded to 1..seats_requested
  * viewers can view but not perform check-in; anon is refused
  * check-in token search and guest manifest are event-scoped; audit is recorded
  * public invite never exposes check-in fields

Phase 4.5 additions (door operations polish):
  * unknown/invalid check-in token resolves to no guest (no leak)
  * token-flow check-in: viewer can look up but not check in; editor can
  * duplicate check-in reliably 409s and never overwrites the original record
  * cancelled RSVPs are ineligible; manifest stays event-scoped

Phase 5 additions (guest communications):
  * opted-in RSVP records a SENT confirmation; no-consent is SKIPPED; no-email
    produces no log; waitlisted confirmation never claims acceptance
  * status-change email respects the notify choice; host alerts de-duplicate
  * reminder audience is accepted+opted-in only; repeated send is guarded (409)
  * viewer can view comms but not send/resend; comms logs leak no provider secret

Phase 5.5 additions (production readiness):
  * /api/health (liveness) and /api/ready (DB connectivity) respond correctly
  * admin/public payloads never expose storage/email/server secrets
  * invite_url is absolute and carries its token (built from SITE_URL)

Phase 5.6 additions (event creation):
  * owner/admin can create an event; viewer/anon cannot (403/401)
  * creation validates the required name; new events default to "draft"
  * a new event is empty and event-scoped and does not disturb other events

Phase 6.2 additions (workspace shell):
  * admin event payloads expose a readiness_completed/readiness_total summary
    that matches the dedicated readiness endpoint (drives the workspace switcher)

Phase 6.1 additions (RSVP availability reasons):
  * admin event/tree payloads expose accepting_rsvps + a machine + human reason
  * draft/closed events and paused trees report the correct closure reason
  * a past deadline (auto-close) closes RSVPs; disabling auto-close reopens them
  * event-level availability ignores per-tree pauses; public payload hides the
    internal reason (guests only see the boolean)

Requires the owner/admin/viewer accounts created by app.seed.
Uses only the Python standard library (no extra deps).
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = os.getenv("BASE_URL", "http://localhost:8010").rstrip("/")
ADMIN_EMAIL = os.getenv("SMOKE_ADMIN_EMAIL", "admin@gatherarc.com")
ADMIN_PASSWORD = os.getenv("SMOKE_ADMIN_PASSWORD", "admin123")

# Fixed demo tokens created by app.seed.
FAM_TOKEN = "fam-demo-token-000000000001"
VIP_TOKEN = "vip-demo-token-00000000000004"
WED_BRIDE_TOKEN = "wed-bride-token-00000000000005"

# 1x1 transparent PNG used to exercise flyer upload.
PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d49444154789c6360000002000154a24f6f0000000049454e44ae426082"
)

_passed = 0
_failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed += 1
        print(f"  FAIL  {name}  {detail}")


def _request(method: str, path: str, token: str | None = None, body: dict | None = None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def get(path, token=None):
    return _request("GET", path, token)


def post(path, body, token=None):
    return _request("POST", path, token, body)


def patch(path, body, token=None):
    return _request("PATCH", path, token, body)


def delete(path, token=None):
    return _request("DELETE", path, token)


def get_status(path, token=None):
    """GET returning only the status code (safe for binary responses)."""
    url = f"{BASE_URL}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def post_multipart(path, token, field, filename, content_type, body):
    boundary = "----gatherarcsmoke"
    pre = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    data = pre + body + f"\r\n--{boundary}--\r\n".encode()
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=data, headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def jget(path, token=None):
    status, raw = get(path, token)
    return status, (json.loads(raw) if raw else None)


def tree_by_name(token, event_id, name):
    _, trees = jget(f"/api/admin/invite-trees?event_id={event_id}", token)
    for t in trees:
        if t["name"] == name:
            return t
    return None


def main() -> int:
    print(f"GatherArc smoke test against {BASE_URL}\n")

    # --- Auth -------------------------------------------------------------
    status, raw = post("/api/admin/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    check("admin login", status == 200, f"status={status} {raw[:120]}")
    if status != 200:
        return 1
    token = json.loads(raw)["access_token"]

    # unauthenticated protected route rejected
    status, _ = get("/api/admin/events")
    check("protected route rejects anonymous", status == 401, f"status={status}")

    # --- Events + scoping -------------------------------------------------
    _, events = jget("/api/admin/events", token)
    birthday = next((e for e in events if e["event_type"] == "birthday"), None)
    wedding = next((e for e in events if e["event_type"] == "wedding"), None)
    check("two seeded events present", birthday is not None and wedding is not None)
    if not (birthday and wedding):
        return 1
    B, W = birthday["id"], wedding["id"]

    _, sumB = jget(f"/api/admin/dashboard/summary?event_id={B}", token)
    _, sumW = jget(f"/api/admin/dashboard/summary?event_id={W}", token)
    check(
        "event scoping: birthday vs wedding allocations differ",
        sumB["total_allocated_seats"] == 130 and sumW["total_allocated_seats"] == 50,
        f"B={sumB['total_allocated_seats']} W={sumW['total_allocated_seats']}",
    )

    # --- Invite tree scoping ---------------------------------------------
    _, treesB = jget(f"/api/admin/invite-trees?event_id={B}", token)
    _, treesW = jget(f"/api/admin/invite-trees?event_id={W}", token)
    namesB = {t["name"] for t in treesB}
    namesW = {t["name"] for t in treesW}
    check(
        "invite tree scoping: birthday trees not in wedding",
        "Family" in namesB and "Family" not in namesW and namesW.isdisjoint(namesB),
        f"B={namesB} W={namesW}",
    )

    # --- Secure token resolution + no leak -------------------------------
    status, raw = get(f"/api/invites/{FAM_TOKEN}")
    check("invite token resolves", status == 200, f"status={status}")
    inv = json.loads(raw)
    check(
        "invite resolves to correct event host",
        inv["event"]["host_or_celebrant_name"] == "Chief Emmanuel Adeyemi",
        inv["event"].get("host_or_celebrant_name"),
    )
    check(
        "no invite tree name leak on public endpoint",
        "Family" not in raw,
        "response contained the tree name 'Family'",
    )
    status, _ = get("/api/invites/this-token-does-not-exist")
    check("bad token -> 404", status == 404, f"status={status}")

    # --- Duplicate RSVP + seat release/recalc (Family, has room) ---------
    fam = tree_by_name(token, B, "Family")
    base_used = fam["used_seats"]
    P1 = "+234 700-000 0001"

    status, raw = post(f"/api/invites/{FAM_TOKEN}/rsvp",
                       {"full_name": "Dup Tester", "phone": P1, "attending": True, "seats_requested": 2})
    r = json.loads(raw)
    check("new RSVP accepted (has room)", r["status"] == "accepted" and r["updated"] is False, raw[:150])

    fam = tree_by_name(token, B, "Family")
    check("accepted RSVP counts against used seats (+2)",
          fam["used_seats"] == base_used + 2, f"used={fam['used_seats']} base={base_used}")

    # Same phone, fewer seats -> update, release 1 seat
    status, raw = post(f"/api/invites/{FAM_TOKEN}/rsvp",
                       {"full_name": "Dup Tester", "phone": "+2347000000001", "attending": True, "seats_requested": 1})
    r = json.loads(raw)
    check("duplicate phone updates existing RSVP", r["updated"] is True, raw[:150])
    fam = tree_by_name(token, B, "Family")
    check("updating duplicate recalculates seats (+1 net)",
          fam["used_seats"] == base_used + 1, f"used={fam['used_seats']} base={base_used}")

    # Update to declined -> releases all seats
    status, raw = post(f"/api/invites/{FAM_TOKEN}/rsvp",
                       {"full_name": "Dup Tester", "phone": P1, "attending": False})
    r = json.loads(raw)
    check("declined update releases seats (back to base)",
          tree_by_name(token, B, "Family")["used_seats"] == base_used and r["status"] == "declined",
          raw[:150])

    # --- Waitlist does not count (VIP is full) ---------------------------
    vip = tree_by_name(token, B, "VIP Guests")
    vip_used_before = vip["used_seats"]
    status, raw = post(f"/api/invites/{VIP_TOKEN}/rsvp",
                       {"full_name": "Waitlist Tester", "phone": "+234 700 000 0002", "attending": True, "seats_requested": 3})
    r = json.loads(raw)
    check("RSVP to full tree is waitlisted", r["status"] == "waitlisted", raw[:150])
    vip = tree_by_name(token, B, "VIP Guests")
    check("waitlisted RSVP does NOT count against used seats",
          vip["used_seats"] == vip_used_before, f"used={vip['used_seats']} before={vip_used_before}")

    # --- Admin promotion validates seats ---------------------------------
    # Full tree: promoting the waitlisted VIP RSVP must fail.
    _, wl = jget(f"/api/admin/rsvps?event_id={B}&status=waitlisted&invite_tree_id={vip['id']}", token)
    vip_wl = next((x for x in wl if x["phone"] == "+2347000000002"), None)
    check("waitlisted VIP RSVP recorded", vip_wl is not None)
    if vip_wl:
        status, raw = patch(f"/api/admin/rsvps/{vip_wl['id']}", {"rsvp_status": "accepted"}, token)
        check("promote waitlisted -> accepted rejected when full (400)", status == 400, f"status={status} {raw[:120]}")

    # Tree with room: promoting a seeded waitlisted RSVP succeeds and counts.
    work = tree_by_name(token, B, "Work Friends")
    work_used_before = work["used_seats"]
    _, wwl = jget(f"/api/admin/rsvps?event_id={B}&status=waitlisted&invite_tree_id={work['id']}", token)
    check("work friends has a seeded waitlisted RSVP", len(wwl) >= 1)
    if wwl:
        seats = wwl[0]["seats_requested"]
        status, raw = patch(f"/api/admin/rsvps/{wwl[0]['id']}", {"rsvp_status": "accepted"}, token)
        check("promote waitlisted -> accepted succeeds when room", status == 200, f"status={status} {raw[:120]}")
        work = tree_by_name(token, B, "Work Friends")
        check("promotion increases used seats",
              work["used_seats"] == work_used_before + seats,
              f"used={work['used_seats']} before={work_used_before} seats={seats}")

    # --- CSV export scoped per event -------------------------------------
    status, csvB = get(f"/api/admin/rsvps/export?event_id={B}", token)
    check("CSV export (birthday) ok", status == 200 and "Full Name" in csvB)
    check("CSV birthday contains a birthday guest", "Bola Adeyemi" in csvB)
    check("CSV birthday excludes wedding guests", "Yemi Bright" not in csvB)
    status, csvW = get(f"/api/admin/rsvps/export?event_id={W}", token)
    check("CSV export (wedding) scoped", "Yemi Bright" in csvW and "Bola Adeyemi" not in csvW)

    # --- Phase 2: event branding update ----------------------------------
    status, raw = patch(
        f"/api/admin/events/{B}",
        {
            "invite_headline": "Smoke Headline",
            "invite_message": "Smoke message copy",
            "theme_preset": "joyful",
        },
        token,
    )
    check("event branding update ok", status == 200, f"status={status} {raw[:120]}")
    _, ev = jget(f"/api/admin/events/{B}", token)
    check(
        "branding fields persist",
        ev.get("invite_headline") == "Smoke Headline"
        and ev.get("invite_message") == "Smoke message copy"
        and ev.get("theme_preset") == "joyful",
        str({k: ev.get(k) for k in ("invite_headline", "theme_preset")}),
    )
    patch(f"/api/admin/events/{B}", {"theme_preset": "nonsense"}, token)
    _, ev = jget(f"/api/admin/events/{B}", token)
    check("invalid theme_preset coerced to elegant", ev.get("theme_preset") == "elegant",
          str(ev.get("theme_preset")))
    _, inv = jget(f"/api/invites/{FAM_TOKEN}")
    check("public invite exposes theme + headline",
          inv["event"].get("theme_preset") == "elegant"
          and inv["event"].get("invite_headline") == "Smoke Headline")

    # --- Phase 2: flyer upload validation --------------------------------
    status, raw = post_multipart(
        f"/api/admin/events/{B}/flyer", token, "file", "flyer.png", "image/png", PNG_1x1
    )
    check("flyer upload (png) -> 200", status == 200, f"status={status} {raw[:120]}")
    up = json.loads(raw) if status == 200 else {}
    check("flyer_storage_path set", bool(up.get("flyer_storage_path")))
    media = up.get("flyer_image_url", "")
    check("flyer_image_url is a /media path", media.startswith("/media/"), media)
    check("uploaded flyer file is served", get_status(media) == 200, f"path={media}")
    _, inv = jget(f"/api/invites/{FAM_TOKEN}")
    check("public invite exposes uploaded flyer", bool(inv["event"].get("flyer_image_url")))
    status, raw = post_multipart(
        f"/api/admin/events/{B}/flyer", token, "file", "note.txt", "text/plain", b"nope"
    )
    check("reject non-image upload -> 400", status == 400, f"status={status} {raw[:100]}")
    status, raw = delete(f"/api/admin/events/{B}/flyer", token)
    check("remove flyer -> 200", status == 200, f"status={status}")
    check("flyer_storage_path cleared", json.loads(raw).get("flyer_storage_path") == "")

    # --- Phase 2: readiness checklist (scoped) ---------------------------
    status, rd = jget(f"/api/admin/events/{B}/readiness", token)
    check("readiness endpoint ok", status == 200, str(status))
    keys = {i["key"]: i["done"] for i in rd["items"]}
    check(
        "readiness items present",
        set(keys) == {"details", "flyer", "venue_map", "gifts", "trees", "deadline"},
        str(set(keys)),
    )
    check("readiness: birthday has invite trees", keys.get("trees") is True)
    check("readiness: flyer not done after removal", keys.get("flyer") is False)

    # --- Phase 2: invite token resolves to the right event (share/QR) -----
    _, invW = jget(f"/api/invites/{WED_BRIDE_TOKEN}")
    check(
        "wedding tree token resolves to wedding host",
        invW["event"]["host_or_celebrant_name"] == "Tolu & Bisi",
        invW["event"].get("host_or_celebrant_name"),
    )
    check("wedding public invite hides tree name", "Bride's Family" not in json.dumps(invW))
    famB = tree_by_name(token, B, "Family")
    check("birthday Family invite_url embeds its own token",
          famB["token"] in famB["invite_url"], famB.get("invite_url"))

    # --- Phase 2: RSVP deadline auto-close behavior (wedding) -------------
    PAST = "2000-01-01T00:00:00"
    patch(f"/api/admin/events/{W}", {"rsvp_deadline": PAST, "auto_close_rsvp": True}, token)
    _, invW = jget(f"/api/invites/{WED_BRIDE_TOKEN}")
    check("past deadline + auto_close closes RSVPs", invW["accepting_rsvps"] is False)
    patch(f"/api/admin/events/{W}", {"auto_close_rsvp": False}, token)
    _, invW = jget(f"/api/invites/{WED_BRIDE_TOKEN}")
    check("auto_close False keeps RSVPs open past deadline", invW["accepting_rsvps"] is True)
    patch(f"/api/admin/events/{W}", {"auto_close_rsvp": True}, token)
    status, raw = post(
        f"/api/invites/{WED_BRIDE_TOKEN}/rsvp",
        {"full_name": "Late Guest", "phone": "+2349099999999", "attending": True},
    )
    check("submit after deadline rejected (409)", status == 409, f"status={status} {raw[:100]}")

    # --- Phase 3: admin roles + permissions ------------------------------
    def _login(email, pw):
        s, raw = post("/api/admin/login", {"email": email, "password": pw})
        return s, (json.loads(raw) if s == 200 else raw)

    s, owner = _login("owner@gatherarc.com", "owner123")
    check("owner can log in", s == 200, str(s))
    otok = owner["access_token"] if s == 200 else None
    check(
        "login response carries role + is_active",
        s == 200 and owner["admin"]["role"] == "owner" and owner["admin"]["is_active"] is True,
    )
    s, viewer = _login("viewer@gatherarc.com", "viewer123")
    vtok = viewer["access_token"] if s == 200 else None
    check("viewer can log in", s == 200, str(s))

    # Admin listing is owner-only and never leaks password hashes.
    s, raw = get("/api/admin/admins", otok)
    check("owner lists admins", s == 200 and len(json.loads(raw)) == 3, f"{s} {raw[:80]}")
    check("admin list omits password hash", "hashed_password" not in raw and '"password"' not in raw)
    s, _ = get("/api/admin/admins", token)  # admin@ has the "admin" role
    check("admin role cannot list admins (403)", s == 403, str(s))
    s, _ = get("/api/admin/admins", vtok)
    check("viewer cannot list admins (403)", s == 403, str(s))
    s, _ = get("/api/admin/admins")
    check("anon cannot list admins (401)", s == 401, str(s))

    # Create admin: owner yes, admin/viewer no.
    s, raw = post(
        "/api/admin/admins",
        {"email": "temp-admin@gatherarc.com", "full_name": "Temp", "role": "viewer", "password": "temp1234"},
        otok,
    )
    check("owner creates admin (201)", s == 201, f"{s} {raw[:100]}")
    temp_id = json.loads(raw)["id"] if s == 201 else None
    s, _ = post(
        "/api/admin/admins",
        {"email": "x@gatherarc.com", "full_name": "X", "role": "viewer", "password": "xxxx1234"},
        token,
    )
    check("admin cannot create admin (403)", s == 403, str(s))
    s, _ = post(
        "/api/admin/admins",
        {"email": "y@gatherarc.com", "full_name": "Y", "role": "viewer", "password": "yyyy1234"},
        vtok,
    )
    check("viewer cannot create admin (403)", s == 403, str(s))

    # Role change works.
    s, raw = patch(f"/api/admin/admins/{temp_id}", {"role": "admin"}, otok)
    check("owner changes role viewer->admin", s == 200 and json.loads(raw)["role"] == "admin", f"{s} {raw[:80]}")

    # Deactivate -> inactive cannot log in -> reactivate.
    s, _ = patch(f"/api/admin/admins/{temp_id}/deactivate", {}, otok)
    check("owner deactivates admin", s == 200, str(s))
    s, raw = post("/api/admin/login", {"email": "temp-admin@gatherarc.com", "password": "temp1234"})
    check("inactive admin cannot log in (403)", s == 403, f"{s} {raw[:60]}")
    s, _ = patch(f"/api/admin/admins/{temp_id}/reactivate", {}, otok)
    check("owner reactivates admin", s == 200, str(s))

    # Self-lockout guards.
    owner_id = owner["admin"]["id"]
    s, _ = patch(f"/api/admin/admins/{owner_id}", {"role": "admin"}, otok)
    check("owner cannot change own role (400)", s == 400, str(s))
    s, _ = patch(f"/api/admin/admins/{owner_id}/deactivate", {}, otok)
    check("owner cannot deactivate self (400)", s == 400, str(s))

    # Viewer is read-only on core resources.
    s, _ = patch(f"/api/admin/events/{B}", {"title": "nope"}, vtok)
    check("viewer cannot edit event (403)", s == 403, str(s))
    s, _ = post(
        "/api/admin/invite-trees",
        {"event_id": B, "name": "V", "allocated_seats": 5, "max_extra_guests": 0},
        vtok,
    )
    check("viewer cannot create invite tree (403)", s == 403, str(s))
    _, some_rsvps = jget(f"/api/admin/rsvps?event_id={B}", token)
    if some_rsvps:
        s, _ = patch(f"/api/admin/rsvps/{some_rsvps[0]['id']}", {"rsvp_status": "cancelled"}, vtok)
        check("viewer cannot modify RSVP (403)", s == 403, str(s))
    # Viewer can still read + export.
    s, _ = get(f"/api/admin/invite-trees?event_id={B}", vtok)
    check("viewer can read invite trees (200)", s == 200, str(s))
    s, _ = get(f"/api/admin/rsvps/export?event_id={B}", vtok)
    check("viewer can export (200)", s == 200, str(s))

    # Admin (editor) can mutate allowed resources.
    s, _ = patch(f"/api/admin/events/{B}", {"venue_name": "Edited by admin"}, token)
    check("admin can edit event (200)", s == 200, str(s))

    # --- Phase 3.5: password policy --------------------------------------
    for weak in ["admin123", "owner123", "password", "short", "        "]:
        s, _ = post(
            "/api/admin/admins",
            {"email": "weak-test@gatherarc.com", "full_name": "W", "role": "viewer", "password": weak},
            otok,
        )
        check(f"weak password rejected ({weak.strip() or 'blank'})", s == 422, f"status={s}")
    s, raw = post(
        "/api/admin/admins",
        {"email": "strongpw@gatherarc.com", "full_name": "S", "role": "viewer", "password": "Str0ngPass!"},
        otok,
    )
    check("strong password accepted (201)", s == 201, f"{s} {raw[:80]}")

    # --- Phase 3.5: audit log access + redaction -------------------------
    s, raw = get("/api/admin/audit-logs", otok)
    check("owner can view audit logs (200)", s == 200, str(s))
    audit = json.loads(raw) if s == 200 else {"items": [], "total": 0}
    check("audit log has entries", audit["total"] >= 1, str(audit.get("total")))
    s, _ = get("/api/admin/audit-logs", token)
    check("admin cannot view audit logs (403)", s == 403, str(s))
    s, _ = get("/api/admin/audit-logs", vtok)
    check("viewer cannot view audit logs (403)", s == 403, str(s))
    s, _ = get("/api/admin/audit-logs")
    check("anon cannot view audit logs (401)", s == 401, str(s))
    _, rawfull = get("/api/admin/audit-logs?limit=500", otok)
    leaked = [w for w in ("hashed_password", "jwt_secret", "Str0ngPass") if w in rawfull]
    check("audit log exposes no secrets", not leaked, f"leaked={leaked}")
    _, rawc = get("/api/admin/audit-logs?action=admin_created", otok)
    check("audit records admin_created", json.loads(rawc)["total"] >= 1)

    # --- Phase 4: event-day check-in + manifest --------------------------
    _, roster = jget(f"/api/admin/check-in/search?event_id={B}", token)
    check("check-in roster is accepted-only", all(r["rsvp_status"] == "accepted" for r in roster))
    target = roster[0]
    ci_seats = target["seats_requested"]

    s, _ = get(f"/api/admin/check-in/search?event_id={B}", vtok)
    check("viewer can view check-in search (200)", s == 200)
    s, _ = post(f"/api/admin/rsvps/{target['id']}/check-in", {}, vtok)
    check("viewer cannot check in (403)", s == 403, str(s))
    s, _ = get(f"/api/admin/check-in/search?event_id={B}")
    check("anon cannot access check-in search (401)", s == 401, str(s))

    s, raw = post(f"/api/admin/rsvps/{target['id']}/check-in", {}, token)
    check("editor checks in accepted guest (200)", s == 200, f"{s} {raw[:100]}")
    ci = json.loads(raw)
    check("checked_in_seats defaults to seats_requested", ci["checked_in_seats"] == ci_seats)
    check("records who checked in", ci["checked_in_by"] is not None)
    s, _ = post(f"/api/admin/rsvps/{target['id']}/check-in", {}, token)
    check("duplicate check-in blocked (409)", s == 409, str(s))

    s, _ = patch(f"/api/admin/rsvps/{target['id']}/checked-in-seats", {"checked_in_seats": ci_seats + 5}, token)
    check("checked-in seats cannot exceed requested (400)", s == 400, str(s))
    s, _ = patch(f"/api/admin/rsvps/{target['id']}/checked-in-seats", {"checked_in_seats": 0}, token)
    check("checked-in seats must be positive (422)", s == 422, str(s))

    _, wl4 = jget(f"/api/admin/rsvps?event_id={B}&status=waitlisted", token)
    if wl4:
        s, _ = post(f"/api/admin/rsvps/{wl4[0]['id']}/check-in", {}, token)
        check("waitlisted RSVP cannot be checked in (400)", s == 400, str(s))
    _, dec4 = jget(f"/api/admin/rsvps?event_id={B}&status=declined", token)
    if dec4:
        s, _ = post(f"/api/admin/rsvps/{dec4[0]['id']}/check-in", {}, token)
        check("declined RSVP cannot be checked in (400)", s == 400, str(s))

    tok4 = target["check_in_token"]
    _, byid4 = jget(f"/api/admin/check-in/search?event_id={B}&token={tok4}", token)
    check("token search resolves the guest", len(byid4) == 1 and byid4[0]["id"] == target["id"])
    _, cross4 = jget(f"/api/admin/check-in/search?event_id={W}&token={tok4}", token)
    check("token search is event-scoped", len(cross4) == 0)

    s, man4 = jget(f"/api/admin/guest-manifest?event_id={B}", vtok)
    check("viewer can view manifest (200)", s == 200)
    check(
        "manifest scoped + has totals",
        man4["event_id"] == B and man4["total_confirmed_seats"] > 0 and man4["total_checked_in_seats"] >= 1,
    )
    _, manW4 = jget(f"/api/admin/guest-manifest?event_id={W}", token)
    check("manifest scoped: birthday guest not in wedding", all(e["id"] != target["id"] for e in manW4["entries"]))

    _, summ4 = jget(f"/api/admin/dashboard/summary?event_id={B}", token)
    check("dashboard has check-in metrics", summ4["checked_in_rsvps"] >= 1 and summ4["checked_in_seats"] >= 1)

    _, aud4 = jget("/api/admin/audit-logs?action=rsvp_checked_in", otok)
    check("audit records rsvp_checked_in", aud4["total"] >= 1)

    _, pub4 = jget(f"/api/invites/{FAM_TOKEN}")
    check("public invite hides check-in fields", "check_in_token" not in json.dumps(pub4) and "checked_in" not in json.dumps(pub4))

    # --- Phase 4.5: door operations polish -------------------------------
    # Unknown / invalid token resolves to no guest (friendly empty, no leak).
    _, badtok = jget(
        f"/api/admin/check-in/search?event_id={B}&token=not-a-real-token-xyz", token
    )
    check("unknown check-in token returns no guest", badtok == [], str(badtok)[:80])

    # Token-flow check-in on a fresh accepted guest (owner/admin path).
    fresh = next(
        (r for r in roster if r["id"] != target["id"] and not r["checked_in_at"]), None
    )
    check("a fresh accepted guest exists for token flow", fresh is not None)
    if fresh:
        ftok = fresh["check_in_token"]
        _, byf = jget(f"/api/admin/check-in/search?event_id={B}&token={ftok}", token)
        check("token flow resolves the fresh guest", len(byf) == 1 and byf[0]["id"] == fresh["id"])
        _, crossf = jget(f"/api/admin/check-in/search?event_id={W}&token={ftok}", token)
        check("token flow stays event-scoped", crossf == [])
        # Viewer can look up via token but cannot check in through it.
        s, _ = get(f"/api/admin/check-in/search?event_id={B}&token={ftok}", vtok)
        check("viewer can token-search (200)", s == 200, str(s))
        s, _ = post(f"/api/admin/rsvps/{fresh['id']}/check-in", {}, vtok)
        check("viewer cannot check in via token flow (403)", s == 403, str(s))
        # Owner/admin checks in via the token flow.
        s, raw = post(f"/api/admin/rsvps/{fresh['id']}/check-in", {}, token)
        check("editor checks in via token flow (200)", s == 200, f"{s} {raw[:80]}")
        first45 = json.loads(raw) if s == 200 else {}
        # Conditional guard: a second attempt cannot double-succeed or overwrite.
        s, _ = post(f"/api/admin/rsvps/{fresh['id']}/check-in", {"seats": 1}, token)
        check("duplicate check-in reliably blocked (409)", s == 409, str(s))
        _, again45 = jget(f"/api/admin/check-in/search?event_id={B}&token={ftok}", token)
        check(
            "duplicate attempt leaves the original check-in intact",
            again45[0]["checked_in_at"] == first45.get("checked_in_at")
            and again45[0]["checked_in_by"] == first45.get("checked_in_by")
            and again45[0]["checked_in_seats"] == first45.get("checked_in_seats"),
        )

    # Cancelled RSVPs are not eligible for check-in.
    _, acc45 = jget(f"/api/admin/rsvps?event_id={B}&status=accepted", token)
    cancel_target = next((r for r in acc45 if not r["checked_in_at"]), None)
    if cancel_target:
        patch(f"/api/admin/rsvps/{cancel_target['id']}", {"rsvp_status": "cancelled"}, token)
        s, _ = post(f"/api/admin/rsvps/{cancel_target['id']}/check-in", {}, token)
        check("cancelled RSVP cannot be checked in (400)", s == 400, str(s))

    # Manifest stays scoped to the selected event after the 4.5 changes.
    _, man45 = jget(f"/api/admin/guest-manifest?event_id={B}", token)
    check("manifest still scoped to selected event", man45["event_id"] == B)

    # --- Phase 5: guest communications -----------------------------------
    # Email backend status (console in tests: configured, not a live provider).
    s, cstat = jget(f"/api/admin/communications/status?event_id={B}", token)
    check("comms status ok", s == 200, str(s))
    check(
        "comms backend is console + configured in tests",
        cstat["email"]["backend"] == "console" and cstat["email"]["configured"] is True,
    )
    check(
        "comms status exposes no provider secret",
        "bearer" not in json.dumps(cstat).lower()
        and "resend_api_key" not in json.dumps(cstat).lower(),
    )

    # Public RSVP: email + opt-in -> accepted + confirmation recorded.
    s, r_acc = post(f"/api/invites/{FAM_TOKEN}/rsvp", {
        "full_name": "Comms Accept", "phone": "+2347788000001",
        "email": "comms-accept@example.com", "attending": True,
        "seats_requested": 1, "email_opt_in": True})
    acc_body = json.loads(r_acc) if s == 200 else {}
    check("opted-in RSVP accepted (200)", s == 200 and acc_body.get("status") == "accepted", f"{s} {r_acc[:100]}")

    # Public RSVP: email but NO opt-in -> skipped (not sent).
    s, _ = post(f"/api/invites/{FAM_TOKEN}/rsvp", {
        "full_name": "Comms NoConsent", "phone": "+2347788000002",
        "email": "comms-noconsent@example.com", "attending": True,
        "seats_requested": 1, "email_opt_in": False})
    check("no-consent RSVP accepted (200)", s == 200, str(s))

    # Public RSVP: NO email -> no email attempt at all.
    s, _ = post(f"/api/invites/{FAM_TOKEN}/rsvp", {
        "full_name": "Comms NoEmail", "phone": "+2347788000003",
        "attending": True, "seats_requested": 1, "email_opt_in": True})
    check("no-email RSVP accepted (200)", s == 200, str(s))

    # Public RSVP to a full tree: waitlisted + confirmation must not claim acceptance.
    s, r_wl = post(f"/api/invites/{VIP_TOKEN}/rsvp", {
        "full_name": "Comms Waitlist", "phone": "+2347788000004",
        "email": "comms-wl@example.com", "attending": True,
        "seats_requested": 3, "email_opt_in": True})
    wl_body = json.loads(r_wl) if s == 200 else {}
    check("opted-in waitlisted RSVP (200)", s == 200 and wl_body.get("status") == "waitlisted", f"{s} {r_wl[:100]}")

    # Inspect the event-scoped communication log.
    _, logs = jget(f"/api/admin/communications/logs?event_id={B}&limit=500", token)
    items = logs["items"]
    conf = {i["recipient"]: i for i in items if i["communication_type"] == "rsvp_confirmation"}
    check("accepted opted-in guest got a SENT confirmation",
          conf.get("comms-accept@example.com", {}).get("status") == "sent")
    check("no-consent guest confirmation is SKIPPED, not sent",
          conf.get("comms-noconsent@example.com", {}).get("status") == "skipped")
    check("no-email guest produced no confirmation log",
          not any(i["communication_type"] == "rsvp_confirmation" and not i["recipient"] for i in items))
    check("waitlisted opted-in guest got a SENT confirmation",
          conf.get("comms-wl@example.com", {}).get("status") == "sent")
    check("comms logs are event-scoped", all(i["event_id"] == B for i in items))
    check("comms logs expose no provider secret",
          "bearer" not in json.dumps(logs).lower() and "resend_api_key" not in json.dumps(logs).lower())
    check("host waitlisted alert recorded",
          any(i["communication_type"] == "host_waitlisted_rsvp" for i in items))

    # Tree-exhausted host alert fires once and is not duplicated.
    post(f"/api/invites/{VIP_TOKEN}/rsvp", {
        "full_name": "Comms Waitlist2", "phone": "+2347788000005",
        "email": "comms-wl2@example.com", "attending": True,
        "seats_requested": 3, "email_opt_in": True})
    _, logs2 = jget(f"/api/admin/communications/logs?event_id={B}&limit=500", token)
    exh = [i for i in logs2["items"] if i["communication_type"] == "host_tree_exhausted"]
    check("tree-exhausted host alert not duplicated", len(exh) == 1, f"count={len(exh)}")

    # Status-change notification respects the notify choice.
    _, found = jget(f"/api/admin/rsvps?event_id={B}&search=comms-accept@example.com", token)
    caid = found[0]["id"] if found else None
    if caid:
        s, _ = patch(f"/api/admin/rsvps/{caid}?notify=true", {"rsvp_status": "cancelled"}, token)
        check("status change with notify=true (200)", s == 200, str(s))
        s, _ = patch(f"/api/admin/rsvps/{caid}?notify=false", {"rsvp_status": "accepted"}, token)
        check("status change with notify=false (200)", s == 200, str(s))
        _, logs3 = jget(f"/api/admin/communications/logs?event_id={B}&limit=500", token)
        su = [i for i in logs3["items"]
              if i["communication_type"] == "rsvp_status_update" and i["recipient"] == "comms-accept@example.com"]
        check("status-update email sent only for the notify=true change", len(su) == 1, f"count={len(su)}")

    # Reminder audience: accepted + opted-in only, no tree-name leak in preview.
    s, aud = jget(f"/api/admin/communications/reminder/preview?event_id={B}", token)
    check("reminder preview ok", s == 200, str(s))
    check("reminder audience is a subset of accepted",
          1 <= aud["eligible_count"] <= aud["total_accepted"])
    check("reminder sample recipients all have emails", all(r["email"] for r in aud["sample"]))
    check("reminder excludes the waitlisted guest",
          all(r["email"] != "comms-wl@example.com" for r in aud["sample"]))
    check("reminder preview has content + no tree-name leak",
          bool(aud["preview"]["subject"])
          and "Family" not in json.dumps(aud["preview"])
          and "VIP Guests" not in json.dumps(aud["preview"]))

    # Reminder send permissions + accidental-resend guard.
    s, _ = post(f"/api/admin/communications/reminder/send?event_id={B}",
                {"exclude_checked_in": False, "confirm_resend": False}, vtok)
    check("viewer cannot send reminders (403)", s == 403, str(s))
    s, _ = post(f"/api/admin/communications/reminder/send?event_id={B}", {}, None)
    check("anon cannot send reminders (401)", s == 401, str(s))
    s, sendres = post(f"/api/admin/communications/reminder/send?event_id={B}",
                      {"exclude_checked_in": False, "confirm_resend": False}, token)
    check("editor sends reminders (200)", s == 200, f"{s} {sendres[:120]}")
    check("reminder reached eligible guests", (json.loads(sendres).get("sent", 0) if s == 200 else 0) >= 1)
    s, _ = post(f"/api/admin/communications/reminder/send?event_id={B}",
                {"exclude_checked_in": False, "confirm_resend": False}, token)
    check("repeated reminder without confirm is guarded (409)", s == 409, str(s))
    s, _ = post(f"/api/admin/communications/reminder/send?event_id={B}",
                {"exclude_checked_in": False, "confirm_resend": True}, token)
    check("reminder resend proceeds with explicit confirm (200)", s == 200, str(s))

    # Viewer may VIEW comms; anon may not.
    s, _ = get(f"/api/admin/communications/status?event_id={B}", vtok)
    check("viewer can view comms status (200)", s == 200, str(s))
    s, _ = get(f"/api/admin/communications/logs?event_id={B}", vtok)
    check("viewer can view comms logs (200)", s == 200, str(s))
    s, _ = get(f"/api/admin/communications/status?event_id={B}")
    check("anon cannot view comms status (401)", s == 401, str(s))

    # Resend confirmation: editor yes, viewer no.
    if caid:
        s, rr = post(f"/api/admin/rsvps/{caid}/resend-confirmation", {}, token)
        check("editor can resend confirmation (200)",
              s == 200 and json.loads(rr)["status"] in ("sent", "skipped", "failed"), f"{s} {rr[:80]}")
        s, _ = post(f"/api/admin/rsvps/{caid}/resend-confirmation", {}, vtok)
        check("viewer cannot resend confirmation (403)", s == 403, str(s))

    # --- Phase 5.5: production readiness + no-secret payloads -------------
    s, health = jget("/api/health")
    check("health endpoint ok", s == 200 and health.get("status") == "ok", f"{s}")
    check("health reports env", "env" in health)
    s, rdy = jget("/api/ready")
    check("readiness endpoint ok (db reachable)", s == 200 and rdy.get("status") == "ready", f"{s} {rdy}")
    check("health service label is gatherarc-api", health.get("service") == "gatherarc-api", str(health.get("service")))
    s, oapi = jget("/openapi.json")
    check(
        "API title is GatherArc (old brand gone)",
        s == 200 and oapi.get("info", {}).get("title") == "GatherArc API",
        str(oapi.get("info", {}).get("title") if oapi else None),
    )

    # Neither admin nor public payloads leak storage/email/server secrets.
    _, evraw = get(f"/api/admin/events/{B}", token)
    ev_l = evraw.lower()
    check(
        "event payload exposes no provider secrets",
        "service_role" not in ev_l and "resend_api_key" not in ev_l and "jwt_secret" not in ev_l,
    )
    _, pubraw = get(f"/api/invites/{FAM_TOKEN}")
    pub_l = pubraw.lower()
    check(
        "public invite exposes no server config/secrets",
        "service_role" not in pub_l and "cors_origins" not in pub_l and "jwt" not in pub_l,
    )

    # invite_url is absolute and carries the tree token (built from SITE_URL).
    fam55 = tree_by_name(token, B, "Family")
    check(
        "invite_url is absolute and carries its token",
        fam55["invite_url"].startswith("http") and fam55["token"] in fam55["invite_url"],
        fam55.get("invite_url"),
    )

    # --- Phase 5.6: event creation (permissions + validation + scoping) ---
    # Snapshot an existing event first, to prove new events don't disturb others.
    _, preB = jget(f"/api/admin/dashboard/summary?event_id={B}", token)

    # Missing the required name -> validation error.
    s, _ = post("/api/admin/events", {"event_type": "birthday"}, token)
    check("event creation requires a name (422)", s == 422, str(s))

    # Owner and admin (editors) can create; viewer / anon cannot.
    s, rawc = post("/api/admin/events", {"name": "Smoke Create (owner)"}, otok)
    check("owner can create event (201)", s == 201, f"{s} {rawc[:100]}")
    created = json.loads(rawc) if s == 201 else {}
    new_id = created.get("id")
    check(
        "new event defaults to draft status",
        created.get("status") == "draft",
        str(created.get("status")),
    )
    check(
        "create returns the expected event",
        created.get("name") == "Smoke Create (owner)" and bool(new_id),
    )
    check(
        "new event starts empty (trees/rsvps/confirmed = 0)",
        created.get("tree_count") == 0
        and created.get("rsvp_count") == 0
        and created.get("confirmed_seats") == 0,
    )

    s, raw_admin = post("/api/admin/events", {"name": "Smoke Create (admin)"}, token)
    check("admin can create event (201)", s == 201, f"{s} {raw_admin[:100]}")

    s, _ = post("/api/admin/events", {"name": "Nope (viewer)"}, vtok)
    check("viewer cannot create event (403)", s == 403, str(s))
    s, _ = post("/api/admin/events", {"name": "Nope (anon)"}, None)
    check("anon cannot create event (401)", s == 401, str(s))

    if new_id:
        _, allev = jget("/api/admin/events", token)
        check(
            "created event appears in the events list",
            any(e["id"] == new_id for e in allev),
        )
        _, newsum = jget(f"/api/admin/dashboard/summary?event_id={new_id}", token)
        check(
            "new event summary is empty + scoped",
            newsum["total_allocated_seats"] == 0 and newsum["total_rsvps"] == 0,
        )
        _, postB = jget(f"/api/admin/dashboard/summary?event_id={B}", token)
        check(
            "creating an event does not affect another event's totals",
            postB["total_allocated_seats"] == preB["total_allocated_seats"]
            and postB["total_rsvps"] == preB["total_rsvps"],
        )

    # --- Phase 6.1: RSVP availability reasons + public payload safety -----
    _, evB61 = jget(f"/api/admin/events/{B}", token)
    check(
        "admin event exposes availability fields",
        "accepting_rsvps" in evB61
        and "availability_reason" in evB61
        and "availability_label" in evB61,
        str([k for k in ("accepting_rsvps", "availability_reason") if k not in evB61]),
    )

    s, rawa = post("/api/admin/events", {"name": "Availability Probe"}, otok)
    check("create availability probe event (201)", s == 201, f"{s} {rawa[:100]}")
    aid = json.loads(rawa)["id"] if s == 201 else None
    if aid:
        _, aev = jget(f"/api/admin/events/{aid}", token)
        check(
            "draft event -> not accepting + event_draft reason",
            aev["accepting_rsvps"] is False
            and aev["availability_reason"] == "event_draft",
            str({k: aev.get(k) for k in ("accepting_rsvps", "availability_reason")}),
        )

        patch(f"/api/admin/events/{aid}", {"status": "active"}, token)
        _, aev = jget(f"/api/admin/events/{aid}", token)
        check(
            "active event -> accepting",
            aev["accepting_rsvps"] is True and aev["availability_reason"] == "accepting",
            str(aev.get("availability_reason")),
        )

        s, rawt = post(
            "/api/admin/invite-trees",
            {"event_id": aid, "name": "Probe Tree", "allocated_seats": 5, "max_extra_guests": 0},
            token,
        )
        atree = json.loads(rawt) if s == 201 else {}
        atok, atid = atree.get("token"), atree.get("id")
        check(
            "new tree is accepting + carries availability fields",
            s == 201
            and atree.get("accepting_rsvps") is True
            and atree.get("availability_reason") == "accepting",
            f"{s} {rawt[:100]}",
        )

        if atid:
            patch(f"/api/admin/invite-trees/{atid}", {"status": "paused"}, token)
            t = tree_by_name(token, aid, "Probe Tree")
            check(
                "paused tree -> tree_paused",
                t["accepting_rsvps"] is False
                and t["availability_reason"] == "tree_paused",
                str(t.get("availability_reason")),
            )
            _, aev = jget(f"/api/admin/events/{aid}", token)
            check(
                "event-level availability ignores per-tree pause",
                aev["accepting_rsvps"] is True,
                str(aev.get("availability_reason")),
            )
            patch(f"/api/admin/invite-trees/{atid}", {"status": "active"}, token)

        # Timezone-safe deadline handling: a clearly-past deadline closes RSVPs.
        patch(
            f"/api/admin/events/{aid}",
            {"rsvp_deadline": "2000-01-01T12:00:00", "auto_close_rsvp": True},
            token,
        )
        _, aev = jget(f"/api/admin/events/{aid}", token)
        check(
            "past deadline + auto_close -> deadline_passed",
            aev["accepting_rsvps"] is False
            and aev["availability_reason"] == "deadline_passed",
            str(aev.get("availability_reason")),
        )
        if atok:
            _, pubprobe = jget(f"/api/invites/{atok}")
            check("public invite closed by deadline", pubprobe["accepting_rsvps"] is False)
            check(
                "public invite hides internal availability reason",
                "availability_reason" not in json.dumps(pubprobe),
            )

        patch(f"/api/admin/events/{aid}", {"auto_close_rsvp": False}, token)
        _, aev = jget(f"/api/admin/events/{aid}", token)
        check(
            "auto_close off reopens despite past deadline",
            aev["accepting_rsvps"] is True,
            str(aev.get("availability_reason")),
        )

        patch(f"/api/admin/events/{aid}", {"status": "closed"}, token)
        _, aev = jget(f"/api/admin/events/{aid}", token)
        check(
            "closed event -> event_closed",
            aev["accepting_rsvps"] is False
            and aev["availability_reason"] == "event_closed",
            str(aev.get("availability_reason")),
        )
        if atok:
            s, _ = post(
                f"/api/invites/{atok}/rsvp",
                {"full_name": "Probe", "phone": "+2348000000123", "attending": True},
            )
            check("closed event rejects public RSVP (409)", s == 409, str(s))

    # --- Phase 6.2: readiness summary on event payloads --------------------
    _, evB62 = jget(f"/api/admin/events/{B}", token)
    check(
        "admin event exposes readiness summary fields",
        "readiness_completed" in evB62 and "readiness_total" in evB62,
        str([k for k in ("readiness_completed", "readiness_total") if k not in evB62]),
    )
    _, rd62 = jget(f"/api/admin/events/{B}/readiness", token)
    check(
        "event readiness summary matches the readiness endpoint",
        evB62.get("readiness_total") == rd62["total"]
        and evB62.get("readiness_completed") == rd62["completed"],
        f"event={evB62.get('readiness_completed')}/{evB62.get('readiness_total')} "
        f"endpoint={rd62['completed']}/{rd62['total']}",
    )
    s, rawb62 = post("/api/admin/events", {"name": "Readiness Probe 6.2"}, otok)
    check("create readiness probe event (201)", s == 201, f"{s} {rawb62[:80]}")
    if s == 201:
        bare = json.loads(rawb62)
        check(
            "bare new event has low readiness out of the full checklist",
            bare.get("readiness_total") == 6 and bare.get("readiness_completed") <= 1,
            f"{bare.get('readiness_completed')}/{bare.get('readiness_total')}",
        )

    # --- Phase 3.5: login rate limiting (run last) -----------------------
    brute = {"email": "bruteforce@gatherarc.com", "password": "wrongwrong"}
    fails = [post("/api/admin/login", brute)[0] for _ in range(5)]
    check("failed logins return 401 before the limit", all(x == 401 for x in fails), str(fails))
    s, raw = post("/api/admin/login", brute)
    check("repeated failed logins are blocked (429)", s == 429, f"status={s} {raw[:80]}")
    s, _ = post("/api/admin/login", {"email": "owner@gatherarc.com", "password": "owner123"})
    check("valid login not blocked by another account's failures", s == 200, str(s))

    print(f"\n{_passed} passed, {_failed} failed")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
