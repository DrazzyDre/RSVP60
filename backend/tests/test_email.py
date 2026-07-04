"""Unit tests for the email templates + communication service.

Standard-library `unittest` only, with a fake in-process provider — no live
email provider and no network. Run from the backend/ directory:

    python -m unittest tests.test_email -v
"""

import unittest
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.email import service, templates
from app.email.base import EmailProvider, EmailResult
from app.models import CommunicationLog, Event, InviteTree, Rsvp

TREE_SECRET_NAME = "Inner Family Circle SECRET"


class FakeProvider(EmailProvider):
    name = "fake"

    def __init__(self, ok: bool = True):
        self.ok = ok
        self.sent: list = []

    def send(self, message):
        self.sent.append(message)
        if self.ok:
            return EmailResult("sent", "fake", "fake-msg-123")
        return EmailResult("failed", "fake", error_summary="Provider returned HTTP 500.")


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _seed(db, **rsvp_kwargs):
    event = Event(
        name="Adaeze's 40th",
        title="A Ruby Celebration",
        host_or_celebrant_name="Adaeze",
        accent_color="#8B0000",
        event_time="5:00 PM",
        venue_name="Grand Hall",
        venue_address="1 Party Road",
        maps_url="https://maps.example/party",
        contact_phone="+2348010000000",
        host_notification_email="host@example.com",
        notify_tree_exhausted=True,
        notify_waitlisted_rsvp=True,
    )
    db.add(event)
    db.flush()
    tree = InviteTree(
        event_id=event.id, name=TREE_SECRET_NAME, allocated_seats=2,
        max_extra_guests=2, token="tree-token-xyz",
    )
    db.add(tree)
    db.flush()
    defaults = dict(
        event_id=event.id, invite_tree_id=tree.id, full_name="Ada <script>",
        phone="+2340000001", rsvp_status="accepted", seats_requested=2,
    )
    defaults.update(rsvp_kwargs)
    rsvp = Rsvp(**defaults)
    db.add(rsvp)
    db.commit()
    db.refresh(rsvp)
    return event, tree, rsvp


def _logs(db):
    return db.query(CommunicationLog).all()


class TemplateTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()

    def test_accepted_confirmation_states_confirmed(self):
        _, _, rsvp = _seed(self.db, rsvp_status="accepted", seats_requested=2)
        subject, html, text = templates.render_confirmation(rsvp.event, rsvp)
        self.assertIn("confirmed", subject.lower())
        self.assertIn("confirmed", text.lower())
        self.assertIn("2 seats", text)

    def test_waitlisted_confirmation_does_not_claim_acceptance(self):
        _, _, rsvp = _seed(self.db, rsvp_status="waitlisted", seats_requested=3)
        subject, html, text = templates.render_confirmation(rsvp.event, rsvp)
        self.assertIn("waitlist", subject.lower())
        self.assertIn("not yet confirmed", text.lower())
        # Must never assert attendance is confirmed.
        self.assertNotIn("your rsvp is confirmed", text.lower())
        self.assertNotIn("your rsvp is confirmed", html.lower())

    def test_declined_confirmation_content(self):
        _, _, rsvp = _seed(self.db, rsvp_status="declined", seats_requested=0)
        subject, html, text = templates.render_confirmation(rsvp.event, rsvp)
        self.assertIn("thanks", subject.lower())
        self.assertIn("not attending", text.lower())

    def test_guest_text_is_escaped(self):
        _, _, rsvp = _seed(self.db, full_name="Ada <script>")
        _, html, _ = templates.render_confirmation(rsvp.event, rsvp)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_no_tree_name_leak(self):
        _, _, rsvp = _seed(self.db)
        for render in (templates.render_confirmation, templates.render_reminder):
            subject, html, text = render(rsvp.event, rsvp)
            blob = subject + html + text
            self.assertNotIn(TREE_SECRET_NAME, blob)
            self.assertNotIn("SECRET", blob)

    def test_no_check_in_token_leak(self):
        _, _, rsvp = _seed(self.db)
        _, html, text = templates.render_confirmation(rsvp.event, rsvp)
        self.assertNotIn(rsvp.check_in_token, html + text)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_db()
        self.provider = FakeProvider(ok=True)
        self._patch = mock.patch.object(
            service, "get_provider", return_value=self.provider
        )
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    # --- consent / presence --------------------------------------------------
    def test_no_email_no_send_no_log(self):
        _, _, rsvp = _seed(self.db, email=None, email_opt_in=False)
        result = service.send_rsvp_confirmation(self.db, rsvp, rsvp.event)
        self.assertIsNone(result)
        self.assertEqual(self.provider.sent, [])
        self.assertEqual(_logs(self.db), [])

    def test_no_consent_is_skipped_not_sent(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=False)
        log = service.send_rsvp_confirmation(self.db, rsvp, rsvp.event)
        self.assertIsNotNone(log)
        self.assertEqual(log.status, "skipped")
        self.assertEqual(self.provider.sent, [])
        self.assertIsNone(rsvp.confirmation_sent_at)

    def test_opted_in_sends_and_stamps(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True)
        log = service.send_rsvp_confirmation(self.db, rsvp, rsvp.event)
        self.assertEqual(log.status, "sent")
        self.assertEqual(log.recipient, "g@example.com")
        self.assertEqual(len(self.provider.sent), 1)
        self.assertIsNotNone(rsvp.confirmation_sent_at)

    # --- provider failure does not corrupt state -----------------------------
    def test_provider_failure_is_recorded_not_raised(self):
        self.provider.ok = False
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True)
        log = service.send_rsvp_confirmation(self.db, rsvp, rsvp.event)
        self.assertEqual(log.status, "failed")
        self.assertIsNone(rsvp.confirmation_sent_at)
        # RSVP row is untouched by the delivery failure.
        self.assertIsNotNone(self.db.get(Rsvp, rsvp.id))
        # No provider secret leaks into the recorded error summary.
        self.assertNotIn("Bearer", log.error_summary or "")

    # --- status update -------------------------------------------------------
    def test_status_update_unchanged_sends_nothing(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True,
                           rsvp_status="accepted")
        result = service.send_rsvp_status_update(
            self.db, rsvp, rsvp.event, old_status="accepted", notify=True
        )
        self.assertIsNone(result)
        self.assertEqual(self.provider.sent, [])

    def test_status_update_respects_notify_false(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True,
                           rsvp_status="accepted")
        result = service.send_rsvp_status_update(
            self.db, rsvp, rsvp.event, old_status="waitlisted", notify=False
        )
        self.assertIsNone(result)
        self.assertEqual(self.provider.sent, [])

    def test_status_update_sends_on_change(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True,
                           rsvp_status="accepted")
        log = service.send_rsvp_status_update(
            self.db, rsvp, rsvp.event, old_status="waitlisted", notify=True
        )
        self.assertEqual(log.status, "sent")
        self.assertIsNotNone(rsvp.status_email_sent_at)

    # --- check-in acknowledgement -------------------------------------------
    def test_check_in_ack_sends_once(self):
        _, _, rsvp = _seed(self.db, email="g@example.com", email_opt_in=True,
                           checked_in_seats=2)
        first = service.send_check_in_acknowledgement(self.db, rsvp, rsvp.event)
        self.assertEqual(first.status, "sent")
        second = service.send_check_in_acknowledgement(self.db, rsvp, rsvp.event)
        self.assertIsNone(second)  # already acknowledged
        self.assertEqual(len(self.provider.sent), 1)

    # --- host alerts ---------------------------------------------------------
    def test_tree_exhausted_alert_not_duplicated(self):
        event, tree, _ = _seed(self.db)
        ctx = {"tree_name": tree.name, "allocated": tree.allocated_seats}
        a = service.send_host_alert(self.db, event, "host_tree_exhausted", ctx,
                                    invite_tree_id=tree.id)
        b = service.send_host_alert(self.db, event, "host_tree_exhausted", ctx,
                                    invite_tree_id=tree.id)
        self.assertIsNotNone(a)
        self.assertIsNone(b)  # deduped
        exhausted_logs = [
            r for r in _logs(self.db) if r.communication_type == "host_tree_exhausted"
        ]
        self.assertEqual(len(exhausted_logs), 1)

    def test_host_alert_skipped_without_recipient(self):
        event, tree, _ = _seed(self.db)
        event.host_notification_email = ""
        self.db.commit()
        result = service.send_host_alert(
            self.db, event, "host_tree_exhausted", {}, invite_tree_id=tree.id
        )
        self.assertIsNone(result)
        self.assertEqual(self.provider.sent, [])

    # --- bulk reminder -------------------------------------------------------
    def test_reminder_summary_counts(self):
        event, tree, r1 = _seed(self.db, email="a@example.com", email_opt_in=True)
        r2 = Rsvp(event_id=event.id, invite_tree_id=tree.id, full_name="No Consent",
                  phone="+2", rsvp_status="accepted", seats_requested=1,
                  email="b@example.com", email_opt_in=False)
        self.db.add(r2)
        self.db.commit()
        summary = service.send_event_reminder(self.db, event, [r1, r2])
        self.assertEqual(summary["sent"], 1)
        self.assertEqual(summary["skipped"], 1)
        self.assertIsNotNone(r1.reminder_sent_at)


if __name__ == "__main__":
    unittest.main()
