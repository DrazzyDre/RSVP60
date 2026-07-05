"""Tests for the email-validation command (scripts.validate_email).

Uses the console provider or a mocked Resend HTTP call — no live email, no
network. Run from the backend/ directory:

    python -m unittest tests.test_validate_email -v
"""

import contextlib
import io
import unittest
import urllib.error
from unittest import mock

from app.config import settings
from app.email import providers as providers_mod
from scripts import validate_email as ve


@contextlib.contextmanager
def override_settings(**kwargs):
    old = {k: getattr(settings, k) for k in kwargs}
    for k, v in kwargs.items():
        setattr(settings, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(settings, k, v)


@contextlib.contextmanager
def _capture():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        yield buf


class ConfigCheckTests(unittest.TestCase):
    def test_console_backend_passes(self):
        with override_settings(email_backend="console", app_env="development"):
            with _capture():
                self.assertEqual(ve.run(), 0)

    def test_console_in_production_warns_but_passes(self):
        with override_settings(email_backend="console", app_env="production"):
            with _capture() as out:
                self.assertEqual(ve.run(), 0)
        self.assertIn("WARNING", out.getvalue())
        self.assertIn("console", out.getvalue().lower())

    def test_resend_without_key_fails(self):
        with override_settings(
            email_backend="resend",
            resend_api_key="",
            email_from_address="invites@example.com",
        ):
            with _capture():
                self.assertEqual(ve.run(), 1)

    def test_resend_with_invalid_from_address_fails(self):
        with override_settings(
            email_backend="resend",
            resend_api_key="re_key",
            email_from_address="not-an-email",
        ):
            with _capture():
                self.assertEqual(ve.run(), 1)

    def test_resend_fully_configured_passes(self):
        with override_settings(
            email_backend="resend",
            resend_api_key="re_key",
            email_from_address="invites@example.com",
        ):
            with _capture():
                self.assertEqual(ve.run(), 0)

    def test_api_key_never_printed(self):
        with override_settings(
            email_backend="resend",
            resend_api_key="re_SUPERSECRET_VALUE",
            email_from_address="invites@example.com",
        ):
            with _capture() as out:
                ve.run()
        self.assertNotIn("re_SUPERSECRET_VALUE", out.getvalue())


class SendTestTests(unittest.TestCase):
    def test_invalid_recipient_fails(self):
        with override_settings(email_backend="console"):
            with _capture():
                self.assertEqual(ve.run(send_to="not-an-email"), 1)

    def test_console_send_succeeds(self):
        with override_settings(email_backend="console"):
            with _capture():
                self.assertEqual(ve.run(send_to="approved@example.com"), 0)

    def test_resend_send_success(self):
        with override_settings(
            email_backend="resend",
            resend_api_key="re_key",
            email_from_address="invites@example.com",
            email_timeout_seconds=5,
        ):
            cm = mock.MagicMock()
            cm.__enter__.return_value.read.return_value = b'{"id":"abc123"}'
            cm.__exit__.return_value = False
            with mock.patch.object(
                providers_mod.urllib.request, "urlopen", return_value=cm
            ):
                with _capture() as out:
                    self.assertEqual(ve.run(send_to="approved@example.com"), 0)
        self.assertIn("abc123", out.getvalue())

    def test_resend_send_failure_exits_nonzero(self):
        err = urllib.error.HTTPError(
            "https://api.resend.com/emails", 403, "Forbidden", {}, io.BytesIO(b"{}")
        )
        with override_settings(
            email_backend="resend",
            resend_api_key="re_key",
            email_from_address="invites@example.com",
        ):
            with mock.patch.object(
                providers_mod.urllib.request, "urlopen", side_effect=err
            ):
                with _capture() as out:
                    self.assertEqual(ve.run(send_to="approved@example.com"), 1)
        self.assertIn("verified", out.getvalue().lower())


if __name__ == "__main__":
    unittest.main()
