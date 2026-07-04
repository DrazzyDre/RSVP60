"""Unit tests for production configuration guards, URL generation and the
proxy-aware client-IP helper. Standard-library `unittest`, no live services.

    python -m unittest tests.test_config -v
"""

import unittest
from types import SimpleNamespace

from app import urls
from app.config import UNSAFE_JWT_DEFAULT, Settings, _is_local_origin
from app.ratelimit import client_ip

GOOD_SECRET = "x" * 40


def _prod(**overrides) -> Settings:
    """A minimally-valid production Settings, with explicit overrides.

    Explicit kwargs take priority over any .env / environment values, so these
    tests are deterministic regardless of the developer's local .env.
    """
    base = dict(
        app_env="production",
        jwt_secret=GOOD_SECRET,
        site_url="https://app.example.com",
        cors_origins="https://app.example.com",
        storage_backend="local",
        email_backend="console",
    )
    base.update(overrides)
    return Settings(**base)


class LocalOriginTests(unittest.TestCase):
    def test_local_origins_detected(self):
        for url in ["", "http://localhost:3000", "https://127.0.0.1", "http://0.0.0.0:8010"]:
            self.assertTrue(_is_local_origin(url), url)

    def test_public_origins_pass(self):
        for url in ["https://app.example.com", "https://rsvp.mydomain.co"]:
            self.assertFalse(_is_local_origin(url), url)


class ProductionGuardTests(unittest.TestCase):
    def test_good_production_config_passes(self):
        _prod().validate_runtime()  # should not raise

    def test_fully_configured_supabase_resend_passes(self):
        _prod(
            storage_backend="supabase",
            supabase_url="https://proj.supabase.co",
            supabase_service_role_key="svc-key",
            email_backend="resend",
            resend_api_key="re_key",
            email_from_address="invites@example.com",
        ).validate_runtime()

    def test_default_jwt_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(jwt_secret=UNSAFE_JWT_DEFAULT).validate_runtime()

    def test_localhost_site_url_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(site_url="http://localhost:3000").validate_runtime()

    def test_empty_site_url_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(site_url="").validate_runtime()

    def test_empty_cors_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(cors_origins="").validate_runtime()

    def test_localhost_only_cors_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(cors_origins="http://localhost:3000,http://127.0.0.1:3000").validate_runtime()

    def test_wildcard_cors_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(cors_origins="*").validate_runtime()

    def test_supabase_without_credentials_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(storage_backend="supabase").validate_runtime()

    def test_resend_without_credentials_rejected(self):
        with self.assertRaises(RuntimeError):
            _prod(email_backend="resend").validate_runtime()

    def test_development_is_lenient(self):
        # The dev default config must still boot (guards are production-only).
        Settings(app_env="development").validate_runtime()


class UrlGenerationTests(unittest.TestCase):
    def setUp(self):
        self._orig = urls.settings.site_url

    def tearDown(self):
        urls.settings.site_url = self._orig

    def test_invite_url_uses_site_url(self):
        urls.settings.site_url = "https://rsvp.example.com"
        self.assertEqual(
            urls.invite_url("abc123"), "https://rsvp.example.com/invite/abc123"
        )

    def test_invite_url_strips_trailing_slash(self):
        urls.settings.site_url = "https://rsvp.example.com/"
        self.assertEqual(
            urls.invite_url("tok"), "https://rsvp.example.com/invite/tok"
        )

    def test_invite_url_never_localhost_when_site_url_is_public(self):
        urls.settings.site_url = "https://rsvp.example.com"
        self.assertNotIn("localhost", urls.invite_url("tok"))


class ClientIpTests(unittest.TestCase):
    def _req(self, xff=None, host="203.0.113.9"):
        headers = {"x-forwarded-for": xff} if xff else {}
        return SimpleNamespace(
            headers=headers, client=SimpleNamespace(host=host)
        )

    def test_direct_peer_when_proxy_untrusted(self):
        from app import ratelimit

        orig = ratelimit.settings.trust_proxy_headers
        ratelimit.settings.trust_proxy_headers = False
        try:
            # Even with a forged XFF, we use the direct socket peer.
            self.assertEqual(client_ip(self._req(xff="1.2.3.4", host="10.0.0.1")), "10.0.0.1")
        finally:
            ratelimit.settings.trust_proxy_headers = orig

    def test_forwarded_for_used_when_proxy_trusted(self):
        from app import ratelimit

        orig = ratelimit.settings.trust_proxy_headers
        ratelimit.settings.trust_proxy_headers = True
        try:
            self.assertEqual(
                client_ip(self._req(xff="203.0.113.5, 10.0.0.1", host="10.0.0.1")),
                "203.0.113.5",
            )
            # No XFF present -> still falls back to the direct peer.
            self.assertEqual(client_ip(self._req(host="10.0.0.2")), "10.0.0.2")
        finally:
            ratelimit.settings.trust_proxy_headers = orig


if __name__ == "__main__":
    unittest.main()
