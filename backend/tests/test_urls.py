"""Regression tests for production URL generation (Phase 6 §11).

Guarantees that server-generated links (public invite URLs and the links inside
transactional emails) are built from ``SITE_URL`` and never leak a local /
development origin into a deployed environment. No live services.

    python -m unittest tests.test_urls -v

Note: QR, Google Calendar, ICS and WhatsApp links are generated client-side from
the browser origin (see frontend lib/calendar.ts, lib/share.ts) and are correct
by construction in the deployed frontend; this suite covers the server side.
"""

import unittest
from types import SimpleNamespace

from app import urls
from app.email import templates

PILOT_ORIGIN = "https://rsvp60-pilot.vercel.app"
# Substrings that must never appear in a production-generated URL.
FORBIDDEN = ["localhost", "127.0.0.1", "0.0.0.0", ":8010", ":3005", ":3000"]


def _assert_clean(test: unittest.TestCase, text: str) -> None:
    for bad in FORBIDDEN:
        test.assertNotIn(bad, text, f"generated content leaked '{bad}'")


class InviteUrlTests(unittest.TestCase):
    def setUp(self):
        self._orig = urls.settings.site_url
        urls.settings.site_url = PILOT_ORIGIN

    def tearDown(self):
        urls.settings.site_url = self._orig

    def test_invite_url_uses_pilot_origin(self):
        url = urls.invite_url("pilot-token-abc")
        self.assertEqual(url, f"{PILOT_ORIGIN}/invite/pilot-token-abc")
        _assert_clean(self, url)

    def test_site_origin_strips_trailing_slash(self):
        urls.settings.site_url = PILOT_ORIGIN + "/"
        self.assertEqual(urls.site_origin(), PILOT_ORIGIN)
        self.assertTrue(urls.invite_url("t").startswith(PILOT_ORIGIN + "/invite/"))


class EmailUrlTests(unittest.TestCase):
    """The only link in guest emails is the public invite URL — it must be the
    pilot origin, carry the token, and never expose a local host."""

    def setUp(self):
        self._orig = urls.settings.site_url
        urls.settings.site_url = PILOT_ORIGIN

    def tearDown(self):
        urls.settings.site_url = self._orig

    def _event(self):
        return SimpleNamespace(
            title="RSVP60 Pilot Celebration",
            name="RSVP60 Pilot Celebration",
            host_or_celebrant_name="Pilot Host",
            event_date=None,
            event_time="5:00 PM",
            venue_name="Pilot Venue",
            venue_address="1 Test Street",
            maps_url="",
            dress_code="",
            contact_phone="",
            accent_color="",
            rsvp_deadline=None,
        )

    def _rsvp(self, status="accepted"):
        return SimpleNamespace(
            full_name="Pilot Guest",
            rsvp_status=status,
            seats_requested=2,
            checked_in_seats=None,
            invite_tree=SimpleNamespace(token="pilot-token-xyz"),
        )

    def test_confirmation_links_use_pilot_origin(self):
        subject, html_out, text = templates.render_confirmation(self._event(), self._rsvp())
        self.assertIn(f"{PILOT_ORIGIN}/invite/pilot-token-xyz", html_out)
        self.assertIn(f"{PILOT_ORIGIN}/invite/pilot-token-xyz", text)
        for content in (subject, html_out, text):
            _assert_clean(self, content)

    def test_reminder_links_use_pilot_origin(self):
        _, html_out, text = templates.render_reminder(self._event(), self._rsvp())
        self.assertIn(f"{PILOT_ORIGIN}/invite/pilot-token-xyz", html_out)
        _assert_clean(self, html_out)
        _assert_clean(self, text)

    def test_emails_never_leak_invite_tree_name_or_token_field(self):
        # Guest emails must not contain the private tree name; the token appears
        # only inside the public invite URL, never as a bare check-in token.
        rsvp = self._rsvp()
        rsvp.invite_tree = SimpleNamespace(token="pilot-token-xyz", name="VIP Family")
        _, html_out, text = templates.render_confirmation(self._event(), rsvp)
        self.assertNotIn("VIP Family", html_out)
        self.assertNotIn("VIP Family", text)


if __name__ == "__main__":
    unittest.main()
