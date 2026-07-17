"""Tests for Phase 8A event-duplication foundation.

Standard-library ``unittest`` with in-memory SQLite — no network, no live email
or storage provider. Because httpx / TestClient is unavailable, the endpoint is
exercised by calling the router function directly; authorization is proven by
calling the shared deps (``require_editor`` / ``get_current_admin``) directly.
Run from backend/:

    python -m unittest tests.test_event_duplication -v
"""

import json
import unittest
from datetime import datetime
from unittest import mock

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import notifications as notif
from app.database import Base
from app.deps import get_current_admin, require_editor
from app.models import (
    Admin,
    AdminNotification,
    AuditLog,
    CommunicationLog,
    Event,
    InviteTree,
    Rsvp,
)
from app.routers import admin as admin_router
from app.schemas import EventDuplicateRequest
from app.seat_logic import used_seats


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _admin(db, role="owner"):
    a = Admin(
        email=f"{role}@example.com", role=role, hashed_password="x", is_active=True
    )
    db.add(a)
    db.flush()
    return a


def _make_source_event(db):
    """A fully-populated, live source event (every copyable group set)."""
    event = Event(
        name="Aunt Ada's 60th Birthday",
        event_type="birthday",
        host_or_celebrant_name="Ada",
        title="Ada's Big 6-0",
        invite_headline="You're invited!",
        invite_message="Join us to celebrate.",
        description="A wonderful evening of food and music.",
        event_date=datetime(2026, 9, 14, 14, 0, 0),
        event_time="2:00 PM",
        venue_name="Grand Hall",
        venue_address="1 Party Lane",
        maps_url="https://maps.example/xyz",
        dress_code="Smart casual",
        gift_details="No gifts, just your presence.",
        contact_phone="+2348010000000",
        flyer_url="https://cdn.example/flyer.png",
        flyer_storage_path="events/src/flyer.png",
        rsvp_deadline=datetime(2026, 9, 7, 23, 59, 59),
        auto_close_rsvp=False,
        theme_preset="joyful",
        accent_color="#ff8800",
        background_preset="festive",
        status="active",
        host_notification_email="host@example.com",
        notify_tree_exhausted=False,
        notify_waitlisted_rsvp=True,
    )
    db.add(event)
    db.flush()
    return event


def _make_tree(db, event, *, token, name="Family", allocated=2, extra=2, status="active"):
    tree = InviteTree(
        event_id=event.id,
        name=name,
        allocated_seats=allocated,
        max_extra_guests=extra,
        token=token,
        status=status,
    )
    db.add(tree)
    db.flush()
    return tree


def _payload(**over):
    base = dict(
        name="Aunt Ada's 61st Birthday",
        event_date=datetime(2027, 9, 14, 14, 0, 0),
        rsvp_deadline=datetime(2027, 9, 7, 23, 59, 59),
        copy_invite_trees=True,
        copy_branding=True,
        copy_public_content=True,
        copy_rsvp_settings=True,
    )
    base.update(over)
    return EventDuplicateRequest(**base)


# --------------------------------------------------------------------------- #
# Request-schema validation
# --------------------------------------------------------------------------- #
class SchemaValidationTests(unittest.TestCase):
    def test_name_required(self):
        with self.assertRaises(ValidationError):
            EventDuplicateRequest(name="")

    def test_defaults_copy_everything(self):
        req = EventDuplicateRequest(name="x")
        self.assertTrue(req.copy_invite_trees)
        self.assertTrue(req.copy_branding)
        self.assertTrue(req.copy_public_content)
        self.assertTrue(req.copy_rsvp_settings)
        self.assertIsNone(req.event_date)
        self.assertIsNone(req.rsvp_deadline)

    def test_deadline_after_event_date_rejected(self):
        with self.assertRaises(ValidationError):
            EventDuplicateRequest(
                name="x",
                event_date=datetime(2027, 1, 1),
                rsvp_deadline=datetime(2027, 2, 1),
            )

    def test_deadline_before_event_date_accepted(self):
        req = EventDuplicateRequest(
            name="x",
            event_date=datetime(2027, 2, 1),
            rsvp_deadline=datetime(2027, 1, 1),
        )
        self.assertEqual(req.rsvp_deadline, datetime(2027, 1, 1))

    def test_deadline_without_date_allowed(self):
        req = EventDuplicateRequest(name="x", rsvp_deadline=datetime(2027, 1, 1))
        self.assertIsNone(req.event_date)

    def test_event_time_optional_and_length_bounded(self):
        self.assertIsNone(EventDuplicateRequest(name="x").event_time)
        with self.assertRaises(ValidationError):
            EventDuplicateRequest(name="x", event_time="y" * 101)


# --------------------------------------------------------------------------- #
# Authorization
# --------------------------------------------------------------------------- #
class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.editor = _admin(self.db, "admin")
        self.viewer = _admin(self.db, "viewer")
        self.source = _make_source_event(self.db)
        self.db.commit()

    def test_owner_can_duplicate(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        self.assertEqual(result.event.status, "draft")

    def test_admin_can_duplicate(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.editor
        )
        self.assertEqual(result.event.status, "draft")

    def test_require_editor_admits_owner_and_admin(self):
        self.assertIs(require_editor(admin=self.owner), self.owner)
        self.assertIs(require_editor(admin=self.editor), self.editor)

    def test_viewer_is_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            require_editor(admin=self.viewer)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_unauthenticated_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            get_current_admin(credentials=None, db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_source_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            admin_router.duplicate_event(
                "does-not-exist", _payload(), db=self.db, admin=self.owner
            )
        self.assertEqual(ctx.exception.status_code, 404)


# --------------------------------------------------------------------------- #
# Core duplication behaviour
# --------------------------------------------------------------------------- #
class CoreDuplicationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)
        self.db.commit()

    def _dup(self, **over):
        return admin_router.duplicate_event(
            self.source.id, _payload(**over), db=self.db, admin=self.owner
        )

    def test_new_id_and_draft_status(self):
        result = self._dup()
        self.assertNotEqual(result.event.id, self.source.id)
        self.assertEqual(result.event.status, "draft")
        self.assertEqual(result.source_event_id, self.source.id)

    def test_explicit_name_date_deadline_used(self):
        result = self._dup()
        new = self.db.get(Event, result.event.id)
        self.assertEqual(new.name, "Aunt Ada's 61st Birthday")
        self.assertEqual(new.event_date, datetime(2027, 9, 14, 14, 0, 0))
        self.assertEqual(new.rsvp_deadline, datetime(2027, 9, 7, 23, 59, 59))

    def test_source_deadline_not_inherited(self):
        result = self._dup(rsvp_deadline=None)
        new = self.db.get(Event, result.event.id)
        self.assertIsNone(new.rsvp_deadline)

    def test_public_content_copies_when_enabled(self):
        result = self._dup()
        new = self.db.get(Event, result.event.id)
        self.assertEqual(new.title, "Ada's Big 6-0")
        self.assertEqual(new.host_or_celebrant_name, "Ada")
        self.assertEqual(new.event_type, "birthday")
        self.assertEqual(new.venue_name, "Grand Hall")
        self.assertEqual(new.maps_url, "https://maps.example/xyz")
        self.assertEqual(new.gift_details, "No gifts, just your presence.")
        self.assertEqual(new.contact_phone, "+2348010000000")

    def test_branding_copies_when_enabled(self):
        result = self._dup()
        new = self.db.get(Event, result.event.id)
        self.assertEqual(new.theme_preset, "joyful")
        self.assertEqual(new.accent_color, "#ff8800")
        self.assertEqual(new.background_preset, "festive")

    def test_rsvp_settings_copy_when_enabled(self):
        result = self._dup()
        new = self.db.get(Event, result.event.id)
        self.assertFalse(new.auto_close_rsvp)
        self.assertEqual(new.host_notification_email, "host@example.com")
        self.assertFalse(new.notify_tree_exhausted)
        self.assertTrue(new.notify_waitlisted_rsvp)

    def test_disabled_groups_do_not_copy(self):
        result = self._dup(
            copy_branding=False,
            copy_public_content=False,
            copy_rsvp_settings=False,
            copy_invite_trees=False,
        )
        new = self.db.get(Event, result.event.id)
        # Public content reset to model defaults.
        self.assertEqual(new.title, "")
        self.assertEqual(new.venue_name, "")
        self.assertEqual(new.contact_phone, "")  # public contact content, reset
        # event_type is core classification — ALWAYS preserved, never reset.
        self.assertEqual(new.event_type, "birthday")
        # Branding reset to defaults.
        self.assertEqual(new.theme_preset, "elegant")
        self.assertEqual(new.accent_color, "")
        self.assertEqual(new.background_preset, "")
        # RSVP settings reset to defaults.
        self.assertTrue(new.auto_close_rsvp)
        self.assertEqual(new.host_notification_email, "")  # operational comms, reset
        self.assertTrue(new.notify_tree_exhausted)
        self.assertFalse(new.notify_waitlisted_rsvp)
        # Explicit fields still applied.
        self.assertEqual(new.name, "Aunt Ada's 61st Birthday")
        self.assertEqual(result.invite_trees_copied, 0)

    def test_event_type_always_preserved(self):
        # event_type must copy regardless of copy_public_content.
        for copy_content in (True, False):
            result = self._dup(copy_public_content=copy_content)
            new = self.db.get(Event, result.event.id)
            self.assertEqual(
                new.event_type, "birthday", msg=f"copy_public_content={copy_content}"
            )

    def test_contact_phone_only_with_public_content(self):
        enabled = self.db.get(Event, self._dup(copy_public_content=True).event.id)
        self.assertEqual(enabled.contact_phone, "+2348010000000")
        disabled = self.db.get(Event, self._dup(copy_public_content=False).event.id)
        self.assertEqual(disabled.contact_phone, "")

    def test_host_notification_email_only_with_rsvp_settings(self):
        enabled = self.db.get(Event, self._dup(copy_rsvp_settings=True).event.id)
        self.assertEqual(enabled.host_notification_email, "host@example.com")
        disabled = self.db.get(Event, self._dup(copy_rsvp_settings=False).event.id)
        self.assertEqual(disabled.host_notification_email, "")


# --------------------------------------------------------------------------- #
# Schedule fields (event_date / event_time / rsvp_deadline are request-driven)
# --------------------------------------------------------------------------- #
class ScheduleFieldTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)  # event_time="2:00 PM"
        self.db.commit()

    def _dup(self, **over):
        return admin_router.duplicate_event(
            self.source.id, _payload(**over), db=self.db, admin=self.owner
        )

    def test_event_time_honoured_when_provided(self):
        new = self.db.get(Event, self._dup(event_time="6:30 PM").event.id)
        self.assertEqual(new.event_time, "6:30 PM")

    def test_event_time_reset_when_omitted(self):
        # _payload() sends no event_time -> reset to empty, NOT copied from source.
        new = self.db.get(Event, self._dup().event.id)
        self.assertEqual(new.event_time, "")
        self.assertNotEqual(self.source.event_time, "")  # source had a value

    def test_event_time_not_controlled_by_copy_groups(self):
        # Even with every copy group ON, an omitted event_time still resets.
        new = self.db.get(
            Event,
            self._dup(
                copy_public_content=True,
                copy_branding=True,
                copy_rsvp_settings=True,
                copy_invite_trees=True,
            ).event.id,
        )
        self.assertEqual(new.event_time, "")

    def test_schedule_fully_request_driven(self):
        new = self.db.get(
            Event,
            self._dup(
                event_date=datetime(2028, 1, 2, 10, 0, 0),
                event_time="10:00 AM",
                rsvp_deadline=datetime(2028, 1, 1, 12, 0, 0),
            ).event.id,
        )
        self.assertEqual(new.event_date, datetime(2028, 1, 2, 10, 0, 0))
        self.assertEqual(new.event_time, "10:00 AM")
        self.assertEqual(new.rsvp_deadline, datetime(2028, 1, 1, 12, 0, 0))

    def test_source_unchanged(self):
        _make_tree(self.db, self.source, token="src-a")
        self.db.commit()
        before = (
            self.source.name,
            self.source.status,
            self.source.theme_preset,
            self.source.flyer_url,
        )
        self._dup()
        self.db.refresh(self.source)
        self.assertEqual(
            (
                self.source.name,
                self.source.status,
                self.source.theme_preset,
                self.source.flyer_url,
            ),
            before,
        )
        self.assertEqual(
            self.db.query(InviteTree).filter_by(event_id=self.source.id).count(), 1
        )


# --------------------------------------------------------------------------- #
# Flyer / storage
# --------------------------------------------------------------------------- #
class FlyerTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)  # has flyer_url + storage path
        self.db.commit()

    def test_flyer_not_copied(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        new = self.db.get(Event, result.event.id)
        self.assertEqual(new.flyer_url, "")
        self.assertEqual(new.flyer_storage_path, "")
        self.assertFalse(result.flyer_copied)

    def test_readiness_flags_missing_flyer(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        new = self.db.get(Event, result.event.id)
        tree_count = (
            self.db.query(InviteTree).filter_by(event_id=new.id).count()
        )
        items = {i.key: i.done for i in admin_router._readiness_items(new, tree_count)}
        self.assertFalse(items["flyer"])


# --------------------------------------------------------------------------- #
# Invite-tree duplication
# --------------------------------------------------------------------------- #
class InviteTreeDuplicationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)

    def test_trees_copied_with_fresh_ids_and_tokens(self):
        t1 = _make_tree(self.db, self.source, token="src-a", name="Family", allocated=4, extra=2)
        t2 = _make_tree(self.db, self.source, token="src-b", name="Friends", allocated=2, extra=1)
        self.db.commit()
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        self.assertEqual(result.invite_trees_copied, 2)
        new_trees = (
            self.db.query(InviteTree)
            .filter_by(event_id=result.event.id)
            .order_by(InviteTree.created_at)
            .all()
        )
        self.assertEqual({t.name for t in new_trees}, {"Family", "Friends"})
        fam = next(t for t in new_trees if t.name == "Family")
        self.assertEqual(fam.allocated_seats, 4)
        self.assertEqual(fam.max_extra_guests, 2)
        src_ids = {t1.id, t2.id}
        src_tokens = {"src-a", "src-b"}
        for t in new_trees:
            self.assertNotIn(t.id, src_ids)
            self.assertNotIn(t.token, src_tokens)
            self.assertTrue(t.token)
            self.assertEqual(t.status, "active")

    def test_seat_usage_resets(self):
        tree = _make_tree(self.db, self.source, token="src-a", allocated=5)
        self.db.add(
            Rsvp(
                event_id=self.source.id,
                invite_tree_id=tree.id,
                full_name="Confirmed Guest",
                phone="+2348010000001",
                rsvp_status="accepted",
                seats_requested=3,
            )
        )
        self.db.commit()
        self.assertEqual(used_seats(self.db, tree.id), 3)  # source consumed seats
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        new_tree = (
            self.db.query(InviteTree).filter_by(event_id=result.event.id).one()
        )
        self.assertEqual(used_seats(self.db, new_tree.id), 0)  # fresh, unused

    def test_paused_source_tree_becomes_active(self):
        _make_tree(self.db, self.source, token="src-a", status="paused")
        self.db.commit()
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        new_tree = (
            self.db.query(InviteTree).filter_by(event_id=result.event.id).one()
        )
        self.assertEqual(new_tree.status, "active")

    def test_no_trees_when_disabled(self):
        _make_tree(self.db, self.source, token="src-a")
        self.db.commit()
        result = admin_router.duplicate_event(
            self.source.id, _payload(copy_invite_trees=False), db=self.db, admin=self.owner
        )
        self.assertEqual(result.invite_trees_copied, 0)
        self.assertEqual(
            self.db.query(InviteTree).filter_by(event_id=result.event.id).count(), 0
        )


# --------------------------------------------------------------------------- #
# Guest / operational isolation
# --------------------------------------------------------------------------- #
class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)
        self.tree = _make_tree(self.db, self.source, token="src-a", allocated=5)
        # Guest RSVP + operational history attached to the source.
        self.db.add(
            Rsvp(
                event_id=self.source.id,
                invite_tree_id=self.tree.id,
                full_name="Secret Guest",
                phone="+2348011111111",
                email="guest@example.com",
                rsvp_status="accepted",
                seats_requested=2,
            )
        )
        self.db.add(
            CommunicationLog(
                event_id=self.source.id,
                communication_type="rsvp_confirmation",
                recipient="guest@example.com",
                status="sent",
            )
        )
        self.db.commit()
        notif.create_event_notification(
            self.db, self.source, notification_type="rsvp_new", title="New RSVP"
        )

    def test_no_guest_or_operational_data_copied(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        new_id = result.event.id
        self.assertEqual(self.db.query(Rsvp).filter_by(event_id=new_id).count(), 0)
        self.assertEqual(
            self.db.query(CommunicationLog).filter_by(event_id=new_id).count(), 0
        )
        # No success/failure notification created for the new event.
        self.assertEqual(
            self.db.query(AdminNotification).filter_by(event_id=new_id).count(), 0
        )
        # No guest PII leaked onto any duplicated record.
        new_trees = self.db.query(InviteTree).filter_by(event_id=new_id).all()
        blob = " ".join(f"{t.name}{t.token}" for t in new_trees).lower()
        self.assertNotIn("secret guest", blob)
        self.assertNotIn("guest@example.com", blob)
        self.assertNotIn("+2348011111111", blob)


# --------------------------------------------------------------------------- #
# Transactionality
# --------------------------------------------------------------------------- #
class TransactionalityTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)
        _make_tree(self.db, self.source, token="src-a", name="A")
        _make_tree(self.db, self.source, token="src-b", name="B")
        self.db.commit()

    def test_tree_copy_failure_rolls_back_new_event(self):
        events_before = self.db.query(Event).count()
        trees_before = self.db.query(InviteTree).count()
        # Fail while minting the SECOND tree's token — a partial copy would leave
        # the new event + first tree behind if the transaction were not atomic.
        with mock.patch.object(
            admin_router,
            "_unique_invite_token",
            side_effect=["fresh-token-1", RuntimeError("boom")],
        ):
            with self.assertRaises(HTTPException) as ctx:
                admin_router.duplicate_event(
                    self.source.id, _payload(), db=self.db, admin=self.owner
                )
        self.assertEqual(ctx.exception.status_code, 500)
        # Nothing new persisted; source intact.
        self.assertEqual(self.db.query(Event).count(), events_before)
        self.assertEqual(self.db.query(InviteTree).count(), trees_before)
        self.assertEqual(
            self.db.query(InviteTree).filter_by(event_id=self.source.id).count(), 2
        )
        # No stray audit entry for a duplication that never completed.
        self.assertEqual(
            self.db.query(AuditLog).filter_by(action="event_duplicated").count(), 0
        )


# --------------------------------------------------------------------------- #
# Readiness / availability / audit integration
# --------------------------------------------------------------------------- #
class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.owner = _admin(self.db, "owner")
        self.source = _make_source_event(self.db)
        _make_tree(self.db, self.source, token="src-a")
        self.db.commit()

    def test_duplicate_is_draft_and_not_public(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        self.assertFalse(result.event.accepting_rsvps)
        self.assertEqual(result.event.availability_reason, "event_draft")

    def test_readiness_summary_present(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        self.assertEqual(result.event.readiness_total, 6)
        # Trees copied + details/deadline set, but flyer missing -> not all done.
        self.assertLess(result.event.readiness_completed, result.event.readiness_total)
        self.assertEqual(result.event.tree_count, 1)

    def test_audit_entry_written_safely(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        log = (
            self.db.query(AuditLog).filter_by(action="event_duplicated").one()
        )
        meta = json.loads(log.meta)
        self.assertEqual(meta["source_event_id"], self.source.id)
        self.assertEqual(meta["duplicated_event_id"], result.event.id)
        self.assertEqual(meta["invite_trees_copied"], 1)
        self.assertTrue(meta["copy_invite_trees"])
        self.assertEqual(log.entity_type, "event")
        self.assertEqual(log.entity_id, result.event.id)
        self.assertEqual(log.admin_id, self.owner.id)
        # No tokens / guest content in the audit metadata.
        self.assertNotIn("token", log.meta.lower())

    def test_response_shape(self):
        result = admin_router.duplicate_event(
            self.source.id, _payload(), db=self.db, admin=self.owner
        )
        self.assertEqual(result.source_event_id, self.source.id)
        self.assertEqual(result.invite_trees_copied, 1)
        self.assertFalse(result.flyer_copied)
        self.assertEqual(result.event.id, result.event.id)  # EventAdminOut present
        self.assertTrue(result.event.id)


if __name__ == "__main__":
    unittest.main()
