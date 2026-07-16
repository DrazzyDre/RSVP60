"""Tests for the Phase 7 admin notification centre.

Standard-library ``unittest`` with in-memory SQLite. No network, no live email
provider. The API surface is exercised by calling the router functions directly
(there is no httpx/TestClient dependency); the auth dependency is tested on its
own to prove endpoints reject the unauthenticated. Run from backend/:

    python -m unittest tests.test_notifications -v
"""

import json
import unittest
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import notifications as notif
from app.database import Base
from app.deps import get_current_admin
from app.email import service as email_service
from app.email.base import EmailProvider, EmailResult
from app.models import Admin, AdminNotification, Event, InviteTree, Rsvp
from app.routers import admin as admin_router
from app.routers import notifications as notif_router
from app.routers import public as public_router
from app.schemas import RsvpCreate
from app.storage import BUCKET_NOT_FOUND, StorageError


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _make_event(db, name="Sample Gala", status="active"):
    event = Event(name=name, title=name, status=status)
    db.add(event)
    db.flush()
    return event


def _make_tree(db, event, *, allocated=2, token="tok", name="Family"):
    tree = InviteTree(
        event_id=event.id, name=name, allocated_seats=allocated,
        max_extra_guests=2, token=token,
    )
    db.add(tree)
    db.flush()
    return tree


def _viewer(db):
    a = Admin(email="viewer@example.com", role="viewer", hashed_password="x", is_active=True)
    db.add(a)
    db.flush()
    return a


class FailingProvider(EmailProvider):
    name = "failtest"

    def send(self, message):
        return EmailResult("failed", "failtest", error_summary="Provider returned HTTP 500.")


# --------------------------------------------------------------------------- #
# Service layer
# --------------------------------------------------------------------------- #
class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.event = _make_event(self.db)
        self.db.commit()

    def test_create_notification(self):
        note = notif.create_event_notification(
            self.db, self.event, notification_type="rsvp_new",
            title="New RSVP received", message="Ada is attending.",
        )
        self.assertIsNotNone(note)
        self.assertEqual(note.severity, "info")
        self.assertEqual(note.event_id, self.event.id)
        self.assertFalse(note.is_read)

    def test_invalid_severity_falls_back_to_info(self):
        note = notif.create_notification(
            self.db, notification_type="x", title="t", severity="explosive"
        )
        self.assertEqual(note.severity, "info")

    def test_deduped_suppresses_unread_duplicate(self):
        first = notif.create_deduped_notification(
            self.db, dedupe_key="tree_exhausted:t1", notification_type="tree_exhausted",
            title="Full", severity="warning", event_id=self.event.id,
        )
        second = notif.create_deduped_notification(
            self.db, dedupe_key="tree_exhausted:t1", notification_type="tree_exhausted",
            title="Full", severity="warning", event_id=self.event.id,
        )
        self.assertIsNotNone(first)
        self.assertIsNone(second)  # suppressed as duplicate
        self.assertEqual(
            self.db.query(AdminNotification).filter_by(dedupe_key="tree_exhausted:t1").count(),
            1,
        )

    def test_deduped_allows_new_after_read(self):
        first = notif.create_deduped_notification(
            self.db, dedupe_key="k", notification_type="t", title="a", event_id=self.event.id,
        )
        notif.mark_read(self.db, first)
        again = notif.create_deduped_notification(
            self.db, dedupe_key="k", notification_type="t", title="b", event_id=self.event.id,
        )
        self.assertIsNotNone(again)  # once read, the condition can notify again

    def test_metadata_is_scrubbed_of_secrets(self):
        note = notif.create_notification(
            self.db, notification_type="x", title="t",
            meta={"api_key": "re_SUPERSECRET", "resend_token": "abc", "seats": 2},
        )
        stored = json.loads(note.meta)
        self.assertEqual(stored["api_key"], "***")
        self.assertEqual(stored["resend_token"], "***")
        self.assertEqual(stored["seats"], 2)
        self.assertNotIn("re_SUPERSECRET", note.meta)

    def test_unread_count_and_mark_all_read_scoping(self):
        other = _make_event(self.db, name="Other")
        self.db.commit()
        notif.create_event_notification(self.db, self.event, notification_type="a", title="1")
        notif.create_event_notification(self.db, self.event, notification_type="a", title="2")
        notif.create_event_notification(self.db, other, notification_type="a", title="3")
        notif.create_notification(self.db, notification_type="p", title="platform")  # event_id None

        # Scoped to self.event (+ platform): 2 event + 1 platform = 3
        self.assertEqual(
            notif.unread_count(self.db, event_id=self.event.id, include_platform=True), 3
        )
        # Strictly self.event: 2
        self.assertEqual(
            notif.unread_count(self.db, event_id=self.event.id, include_platform=False), 2
        )
        # All: 4
        self.assertEqual(notif.unread_count(self.db), 4)

        # Mark all read for self.event only (strict) -> 2 updated, other+platform remain.
        updated = notif.mark_all_read(self.db, event_id=self.event.id, include_platform=False)
        self.assertEqual(updated, 2)
        self.assertEqual(notif.unread_count(self.db), 2)


# --------------------------------------------------------------------------- #
# API router functions
# --------------------------------------------------------------------------- #
class RouterTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.event = _make_event(self.db)
        self.other = _make_event(self.db, name="Other Event")
        self.admin = _viewer(self.db)  # viewer role — may view + mark read
        self.db.commit()
        notif.create_event_notification(self.db, self.event, notification_type="a",
                                        title="Event one", severity="warning")
        notif.create_event_notification(self.db, self.other, notification_type="a",
                                        title="Other one", severity="error")
        notif.create_notification(self.db, notification_type="p", title="Platform one")

    def test_unauthenticated_is_rejected(self):
        # Every notifications endpoint depends on get_current_admin; with no
        # credentials it raises 401.
        with self.assertRaises(HTTPException) as ctx:
            get_current_admin(credentials=None, db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_viewer_can_list_scoped(self):
        page = notif_router.list_notifications(
            db=self.db, admin=self.admin, event_id=self.event.id,
            include_platform=True, unread=False, severity=None,
            notification_type=None, limit=50, offset=0,
        )
        titles = {i.title for i in page.items}
        self.assertIn("Event one", titles)
        self.assertIn("Platform one", titles)  # platform included
        self.assertNotIn("Other one", titles)  # cross-event isolation

    def test_strict_event_scope_excludes_platform(self):
        page = notif_router.list_notifications(
            db=self.db, admin=self.admin, event_id=self.event.id,
            include_platform=False, unread=False, severity=None,
            notification_type=None, limit=50, offset=0,
        )
        titles = {i.title for i in page.items}
        self.assertIn("Event one", titles)
        self.assertNotIn("Platform one", titles)

    def test_list_reports_event_name(self):
        page = notif_router.list_notifications(
            db=self.db, admin=self.admin, event_id=self.event.id,
            include_platform=False, unread=False, severity=None,
            notification_type=None, limit=50, offset=0,
        )
        self.assertEqual(page.items[0].event_name, self.event.name)

    def test_severity_filter(self):
        page = notif_router.list_notifications(
            db=self.db, admin=self.admin, event_id=None, include_platform=True,
            unread=False, severity="error", notification_type=None, limit=50, offset=0,
        )
        self.assertTrue(all(i.severity == "error" for i in page.items))
        self.assertEqual(page.total, 1)

    def test_unread_count_endpoint(self):
        res = notif_router.notifications_unread_count(
            db=self.db, admin=self.admin, event_id=self.event.id, include_platform=True
        )
        self.assertEqual(res.unread, 2)  # event one + platform one

    def test_mark_one_read_endpoint(self):
        note = self.db.query(AdminNotification).filter_by(title="Event one").one()
        out = notif_router.mark_notification_read(
            note.id, db=self.db, admin=self.admin
        )
        self.assertTrue(out.is_read)
        self.assertIsNotNone(out.read_at)

    def test_mark_read_unknown_id_404(self):
        with self.assertRaises(HTTPException) as ctx:
            notif_router.mark_notification_read("nope", db=self.db, admin=self.admin)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_mark_all_read_endpoint(self):
        res = notif_router.mark_all_notifications_read(
            db=self.db, admin=self.admin, event_id=None, include_platform=True
        )
        self.assertEqual(res.updated, 3)
        self.assertEqual(notif.unread_count(self.db), 0)


# --------------------------------------------------------------------------- #
# Wiring into real flows
# --------------------------------------------------------------------------- #
class WiringTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()

    def _submit(self, token, *, attending=True, seats=1, phone="+2348010000001",
                email=None, opt_in=False):
        payload = RsvpCreate(
            full_name="Guest One", phone=phone, attending=attending,
            seats_requested=seats, email=email, email_opt_in=opt_in,
        )
        return public_router.submit_rsvp(token, payload, db=self.db, _=None)

    def test_new_accepted_rsvp_creates_info_notification(self):
        event = _make_event(self.db)
        _make_tree(self.db, event, allocated=5, token="t-accept")
        self.db.commit()
        self._submit("t-accept", seats=1)
        notes = self.db.query(AdminNotification).filter_by(event_id=event.id).all()
        types = {n.notification_type for n in notes}
        self.assertIn("rsvp_new", types)
        new_note = next(n for n in notes if n.notification_type == "rsvp_new")
        self.assertEqual(new_note.severity, "info")

    def test_waitlisted_rsvp_creates_warning(self):
        event = _make_event(self.db)
        _make_tree(self.db, event, allocated=1, token="t-wait")
        self.db.commit()
        # Consume the only seat.
        self._submit("t-wait", seats=1, phone="+2348010000001")
        # Second guest over capacity -> waitlisted.
        self._submit("t-wait", seats=1, phone="+2348010000002")
        notes = self.db.query(AdminNotification).filter_by(
            event_id=event.id, notification_type="rsvp_waitlisted"
        ).all()
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0].severity, "warning")

    def test_tree_exhausted_notification_is_deduped(self):
        event = _make_event(self.db)
        _make_tree(self.db, event, allocated=1, token="t-full")
        self.db.commit()
        # Fill the tree, then two more RSVPs that each keep it full.
        self._submit("t-full", seats=1, phone="+2348010000001")
        self._submit("t-full", seats=1, phone="+2348010000002")
        self._submit("t-full", seats=1, phone="+2348010000003")
        exhausted = self.db.query(AdminNotification).filter_by(
            event_id=event.id, notification_type="tree_exhausted"
        ).all()
        self.assertEqual(len(exhausted), 1)  # deduped to a single unread item

    def test_email_failure_creates_error_notification_without_secrets(self):
        event = _make_event(self.db)
        tree = _make_tree(self.db, event, allocated=5, token="t-mail")
        rsvp = Rsvp(
            event_id=event.id, invite_tree_id=tree.id, full_name="Ada",
            phone="+2348010000009", email="ada@example.com", email_opt_in=True,
            rsvp_status="accepted", seats_requested=1,
        )
        self.db.add(rsvp)
        self.db.commit()
        with mock.patch.object(email_service, "get_provider", return_value=FailingProvider()):
            email_service.send_rsvp_confirmation(self.db, rsvp, event)
        notes = self.db.query(AdminNotification).filter_by(
            event_id=event.id, notification_type="email_failed"
        ).all()
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0].severity, "error")
        # No secret / api key material anywhere in the notification.
        blob = f"{notes[0].title}{notes[0].message}{notes[0].meta}".lower()
        self.assertNotIn("resend", blob.replace("resend.com", ""))
        self.assertNotIn("bearer", blob)

    def test_storage_failure_creates_error_notification(self):
        event = _make_event(self.db)
        self.db.commit()
        err = StorageError("Supabase upload failed (404).", category=BUCKET_NOT_FOUND, status_code=404)
        with self.assertRaises(HTTPException) as ctx:
            admin_router._raise_storage_http(err, "upload", event.id, db=self.db)
        self.assertEqual(ctx.exception.status_code, 502)
        notes = self.db.query(AdminNotification).filter_by(
            event_id=event.id, notification_type="storage_failed"
        ).all()
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0].severity, "error")
        # The sanitized category is safe to store; no secret/bucket key leaks.
        self.assertNotIn("service_role", notes[0].meta.lower())

    def test_storage_failure_notification_is_deduped(self):
        event = _make_event(self.db)
        self.db.commit()
        err = StorageError("x", category=BUCKET_NOT_FOUND, status_code=404)
        for _ in range(3):
            try:
                admin_router._raise_storage_http(err, "upload", event.id, db=self.db)
            except HTTPException:
                pass
        notes = self.db.query(AdminNotification).filter_by(
            event_id=event.id, notification_type="storage_failed"
        ).all()
        self.assertEqual(len(notes), 1)


if __name__ == "__main__":
    unittest.main()
