"""RSVP60 backend smoke tests.

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

Requires the owner/admin/viewer accounts created by app.seed.
Uses only the Python standard library (no extra deps).
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = os.getenv("BASE_URL", "http://localhost:8010").rstrip("/")
ADMIN_EMAIL = os.getenv("SMOKE_ADMIN_EMAIL", "admin@rsvp60.com")
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
    boundary = "----rsvp60smoke"
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
    print(f"RSVP60 smoke test against {BASE_URL}\n")

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

    s, owner = _login("owner@rsvp60.com", "owner123")
    check("owner can log in", s == 200, str(s))
    otok = owner["access_token"] if s == 200 else None
    check(
        "login response carries role + is_active",
        s == 200 and owner["admin"]["role"] == "owner" and owner["admin"]["is_active"] is True,
    )
    s, viewer = _login("viewer@rsvp60.com", "viewer123")
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
        {"email": "temp-admin@rsvp60.com", "full_name": "Temp", "role": "viewer", "password": "temp1234"},
        otok,
    )
    check("owner creates admin (201)", s == 201, f"{s} {raw[:100]}")
    temp_id = json.loads(raw)["id"] if s == 201 else None
    s, _ = post(
        "/api/admin/admins",
        {"email": "x@rsvp60.com", "full_name": "X", "role": "viewer", "password": "xxxx1234"},
        token,
    )
    check("admin cannot create admin (403)", s == 403, str(s))
    s, _ = post(
        "/api/admin/admins",
        {"email": "y@rsvp60.com", "full_name": "Y", "role": "viewer", "password": "yyyy1234"},
        vtok,
    )
    check("viewer cannot create admin (403)", s == 403, str(s))

    # Role change works.
    s, raw = patch(f"/api/admin/admins/{temp_id}", {"role": "admin"}, otok)
    check("owner changes role viewer->admin", s == 200 and json.loads(raw)["role"] == "admin", f"{s} {raw[:80]}")

    # Deactivate -> inactive cannot log in -> reactivate.
    s, _ = patch(f"/api/admin/admins/{temp_id}/deactivate", {}, otok)
    check("owner deactivates admin", s == 200, str(s))
    s, raw = post("/api/admin/login", {"email": "temp-admin@rsvp60.com", "password": "temp1234"})
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

    print(f"\n{_passed} passed, {_failed} failed")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
