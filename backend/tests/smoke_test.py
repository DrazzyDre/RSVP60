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

    print(f"\n{_passed} passed, {_failed} failed")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
