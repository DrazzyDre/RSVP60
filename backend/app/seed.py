"""Seed the database with development data.

Usage (from the backend/ directory, venv active):

    python -m app.seed

This is DESTRUCTIVE: it drops and recreates all tables, then inserts a single
60th birthday event, 4 invite trees, 3 admin accounts and a spread of sample
RSVPs (accepted / declined / waitlisted) dated over the last ~12 days so the
dashboard charts have something to show.
"""

import os
import sys
from datetime import datetime, timedelta

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Admin, Event, InviteTree, Rsvp
from .security import hash_password

# Admin accounts (documented in the README). Change these for production.
# Note: emails use a real TLD (.com) because the email validator rejects
# reserved special-use domains such as `.test` / `example.com`.
ADMINS = [
    ("admin@rsvp60.com", "Grace Adeyemi", "admin", "admin123"),
    ("host@rsvp60.com", "Tunde Bakare", "admin", "host1234"),
    ("planner@rsvp60.com", "Chidinma Okafor", "admin", "planner123"),
]


def _dt(days_ago: int, hour: int = 12) -> datetime:
    return datetime.utcnow() - timedelta(days=days_ago) + timedelta(hours=hour - 12)


def _guard_production() -> None:
    """Refuse to run the destructive demo seed in production.

    The seed DROPS ALL TABLES and creates demo admins (admin@rsvp60.com /
    admin123). That must never happen silently against a production database.
    An explicit override (ALLOW_PROD_SEED=1) is required to proceed.
    """
    override = os.getenv("ALLOW_PROD_SEED", "").lower() in ("1", "true", "yes")
    if settings.is_production and not override:
        print(
            "REFUSING TO SEED: APP_ENV=production.\n"
            "This command drops all tables and creates demo admin accounts, so it "
            "is disabled in production.\n"
            "If you REALLY intend to seed this database, re-run with "
            "ALLOW_PROD_SEED=1 set.",
            file=sys.stderr,
        )
        sys.exit(1)


def seed() -> None:
    _guard_production()
    print(f"[APP_ENV={settings.app_env}] Dropping and recreating all tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ---- Admins ---------------------------------------------------------
        for email, name, role, password in ADMINS:
            db.add(
                Admin(
                    email=email.lower(),
                    full_name=name,
                    role=role,
                    hashed_password=hash_password(password),
                )
            )

        # ---- Event #1: the 60th birthday (primary seeded event) -------------
        event = Event(
            name="Chief Emmanuel Adeyemi's 60th Birthday Celebration",
            event_type="birthday",
            host_or_celebrant_name="Chief Emmanuel Adeyemi",
            title="A Diamond Celebration at 60",
            description=(
                "With hearts full of gratitude to God, we joyfully invite you to "
                "celebrate six remarkable decades of grace, love and laughter. "
                "Come dine, dance and make memories with us."
            ),
            event_date=datetime.utcnow().replace(microsecond=0) + timedelta(days=45),
            event_time="5:00 PM prompt",
            venue_name="The Grand Ballroom, Eko Hotel & Suites",
            venue_address="1415 Adetokunbo Ademola Street, Victoria Island, Lagos",
            maps_url="https://maps.google.com/?q=Eko+Hotel+and+Suites+Victoria+Island+Lagos",
            dress_code="Elegant Nigerian attire · Colours of the day: Royal Blue & Gold",
            gift_details=(
                "Your presence is the greatest gift of all. Should you wish to give, "
                "the celebrant kindly requests contributions towards the Adeyemi "
                "Education Foundation for underprivileged children."
            ),
            contact_phone="+2348012345678",
            flyer_url="",
            rsvp_deadline=datetime.utcnow().replace(microsecond=0) + timedelta(days=30),
            status="active",
        )
        db.add(event)
        db.flush()

        # ---- Invite trees ---------------------------------------------------
        family = InviteTree(
            event_id=event.id, name="Family", allocated_seats=50,
            max_extra_guests=1, status="active", token="fam-demo-token-000000000001",
        )
        church = InviteTree(
            event_id=event.id, name="Church Friends", allocated_seats=40,
            max_extra_guests=0, status="active", token="church-demo-token-00000000002",
        )
        work = InviteTree(
            event_id=event.id, name="Work Friends", allocated_seats=25,
            max_extra_guests=1, status="active", token="work-demo-token-0000000000003",
        )
        vip = InviteTree(
            event_id=event.id, name="VIP Guests", allocated_seats=15,
            max_extra_guests=2, status="active", token="vip-demo-token-00000000000004",
        )
        db.add_all([family, church, work, vip])
        db.flush()

        # ---- Sample RSVPs ---------------------------------------------------
        # (tree, name, phone, email, attending, rsvp_status, seats, days_ago)
        rows = [
            # Family (50, +1)
            (family, "Bola Adeyemi", "+2348030000001", "bola@example.com", True, "accepted", 2, 12),
            (family, "Femi Adeyemi", "+2348030000002", None, True, "accepted", 2, 11),
            (family, "Ngozi Eze", "+2348030000003", "ngozi@example.com", True, "accepted", 1, 10),
            (family, "Sola Adeyemi", "+2348030000004", None, True, "accepted", 2, 8),
            (family, "Kunle Adeyemi", "+2348030000005", None, True, "accepted", 1, 5),
            (family, "Aisha Bello", "+2348030000006", "aisha@example.com", True, "accepted", 2, 3),
            (family, "Emeka Obi", "+2348030000007", None, False, "declined", 0, 9),
            (family, "Rita Johnson", "+2348030000008", None, False, "declined", 0, 2),

            # Church Friends (40, no +1)
            (church, "Pastor Sam", "+2348040000001", "sam@example.com", True, "accepted", 1, 11),
            (church, "Deaconess Ruth", "+2348040000002", None, True, "accepted", 1, 10),
            (church, "Bro Timothy", "+2348040000003", None, True, "accepted", 1, 7),
            (church, "Sis Deborah", "+2348040000004", "deb@example.com", True, "accepted", 1, 6),
            (church, "Elder Paul", "+2348040000005", None, True, "accepted", 1, 4),
            (church, "Grace Nwosu", "+2348040000006", None, False, "declined", 0, 3),

            # Work Friends (25, +1)
            (work, "Michael Ade", "+2348050000001", "mike@example.com", True, "accepted", 2, 9),
            (work, "Sarah Cole", "+2348050000002", None, True, "accepted", 2, 8),
            (work, "David Ola", "+2348050000003", None, True, "accepted", 1, 6),
            (work, "Linda Peters", "+2348050000004", "linda@example.com", True, "accepted", 2, 1),
            (work, "Tobi Martins", "+2348050000005", None, True, "waitlisted", 2, 1),
            (work, "James Ike", "+2348050000006", None, False, "declined", 0, 5),

            # VIP Guests (15, +2) -> filled to capacity, then a waitlist
            (vip, "Senator Musa", "+2348060000001", "musa@example.com", True, "accepted", 3, 10),
            (vip, "Dr. Okonkwo", "+2348060000002", None, True, "accepted", 3, 9),
            (vip, "Justice Bello", "+2348060000003", None, True, "accepted", 3, 7),
            (vip, "Mrs. Adebayo", "+2348060000004", "ade@example.com", True, "accepted", 3, 4),
            (vip, "Chief Nnamdi", "+2348060000005", None, True, "accepted", 3, 2),
            (vip, "Alhaji Sanni", "+2348060000006", None, True, "waitlisted", 3, 1),
        ]

        for tree, name, phone, email, attending, rstatus, seats, days_ago in rows:
            created = _dt(days_ago)
            rsvp = Rsvp(
                event_id=event.id,
                invite_tree_id=tree.id,
                full_name=name,
                phone=phone,
                email=email,
                attendance_status="attending" if attending else "declined",
                rsvp_status=rstatus,
                seats_requested=seats,
                created_at=created,
                updated_at=created,
            )
            db.add(rsvp)

        # ---- Event #2: a wedding (proves multi-event scoping) ---------------
        # Same code path, no schema changes — just another Event row with its
        # own invite trees and RSVPs. Its seats never affect Event #1.
        wedding = Event(
            name="Tolu & Bisi's Wedding",
            event_type="wedding",
            host_or_celebrant_name="Tolu & Bisi",
            title="Two Hearts, One Love",
            description=(
                "Together with their families, Tolu and Bisi request the honour of "
                "your presence as they exchange vows and begin their journey as one."
            ),
            event_date=datetime.utcnow().replace(microsecond=0) + timedelta(days=70),
            event_time="11:00 AM (church) · 3:00 PM (reception)",
            venue_name="Harbour Point Event Centre",
            venue_address="4 Wilmot Point Road, Victoria Island, Lagos",
            maps_url="https://maps.google.com/?q=Harbour+Point+Victoria+Island+Lagos",
            dress_code="Formal · Colours of the day: Burgundy & Champagne",
            gift_details="A gift registry is available on request from the couple.",
            contact_phone="+2348098765432",
            flyer_url="",
            rsvp_deadline=datetime.utcnow().replace(microsecond=0) + timedelta(days=55),
            status="active",
        )
        db.add(wedding)
        db.flush()

        w_family = InviteTree(
            event_id=wedding.id, name="Bride's Family", allocated_seats=30,
            max_extra_guests=1, status="active", token="wed-bride-token-00000000000005",
        )
        w_friends = InviteTree(
            event_id=wedding.id, name="Couple's Friends", allocated_seats=20,
            max_extra_guests=1, status="active", token="wed-friends-token-0000000000006",
        )
        db.add_all([w_family, w_friends])
        db.flush()

        wedding_rows = [
            (w_family, "Yemi Bright", "+2349010000001", "yemi@example.com", True, "accepted", 2, 6),
            (w_family, "Uche Nnaji", "+2349010000002", None, True, "accepted", 1, 5),
            (w_family, "Halima Yusuf", "+2349010000003", None, False, "declined", 0, 4),
            (w_friends, "Kola Smart", "+2349020000001", "kola@example.com", True, "accepted", 2, 3),
            (w_friends, "Ada Ruby", "+2349020000002", None, True, "waitlisted", 2, 1),
        ]
        for tree, name, phone, email, attending, rstatus, seats, days_ago in wedding_rows:
            created = _dt(days_ago)
            db.add(
                Rsvp(
                    event_id=wedding.id,
                    invite_tree_id=tree.id,
                    full_name=name,
                    phone=phone,
                    email=email,
                    attendance_status="attending" if attending else "declined",
                    rsvp_status=rstatus,
                    seats_requested=seats,
                    created_at=created,
                    updated_at=created,
                )
            )

        db.commit()
        print("Seed complete.")
        print("  Event #1 (birthday):", event.name)
        print("    Invite trees: Family, Church Friends, Work Friends, VIP Guests")
        print("  Event #2 (wedding):", wedding.name)
        print("    Invite trees: Bride's Family, Couple's Friends")
        print("  Admin logins:")
        for email, _, _, password in ADMINS:
            print(f"    {email} / {password}")
        print("\n  Demo invite links (SITE_URL/invite/<token>):")
        for t in (family, church, work, vip, w_family, w_friends):
            print(f"    {t.name:<18} /invite/{t.token}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
