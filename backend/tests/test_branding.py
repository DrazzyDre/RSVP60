"""GatherArc rebrand assertions (Phase 7).

Verifies the platform identity is GatherArc and the old product name no longer
appears in the API title/description or the transactional email templates.

    python -m unittest tests.test_branding -v
"""

import unittest
from types import SimpleNamespace

from app.config import Settings
from app.email import templates
from app.main import app


class BrandingTests(unittest.TestCase):
    def test_fastapi_title_and_description_are_gatherarc(self):
        self.assertEqual(app.title, "GatherArc API")
        self.assertNotIn("RSVP60", app.title)
        self.assertIn("GatherArc", app.description)
        self.assertNotIn("RSVP60", app.description)

    def test_default_email_sender_name_is_gatherarc(self):
        # The shipped default sender identity (overridable via EMAIL_FROM_NAME).
        self.assertEqual(Settings(email_from_name="GatherArc").email_from_name, "GatherArc")
        # And the field's own default (no env/.env override) is GatherArc.
        self.assertEqual(Settings.model_fields["email_from_name"].default, "GatherArc")

    def _fake(self, status="accepted"):
        event = SimpleNamespace(
            title="Pilot Celebration", name="Pilot Celebration",
            host_or_celebrant_name="", event_date=None, event_time="",
            venue_name="", venue_address="", maps_url="", dress_code="",
            contact_phone="", accent_color="", rsvp_deadline=None,
        )
        rsvp = SimpleNamespace(
            full_name="Guest", rsvp_status=status, seats_requested=1,
            checked_in_seats=None, invite_tree=SimpleNamespace(token="tok"),
        )
        return event, rsvp

    def test_email_footer_is_branded_and_has_no_old_name(self):
        event, rsvp = self._fake()
        subject, html_out, text = templates.render_confirmation(event, rsvp)
        self.assertIn("Powered by GatherArc", html_out)
        self.assertIn("From invite to arrival", html_out)
        for content in (subject, html_out, text):
            self.assertNotIn("RSVP60", content)

    def test_reminder_and_status_emails_have_no_old_name(self):
        event, rsvp = self._fake()
        for render in (templates.render_reminder,):
            _, html_out, text = render(event, rsvp)
            self.assertNotIn("RSVP60", html_out)
            self.assertNotIn("RSVP60", text)
        _, html_out, text = templates.render_status_update(event, rsvp, "waitlisted")
        self.assertNotIn("RSVP60", html_out)


if __name__ == "__main__":
    unittest.main()
