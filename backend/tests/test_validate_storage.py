"""Tests for the storage-validation command (scripts.validate_storage).

Uses mocked HTTP so nothing touches a live Supabase project.

    python -m unittest tests.test_validate_storage -v
"""

import contextlib
import io
import shutil
import tempfile
import unittest
import urllib.error
from unittest import mock

from app import storage
from app.config import settings
from scripts import validate_storage as vs


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


def _cm(return_value=None):
    cm = mock.MagicMock()
    cm.__enter__.return_value = return_value or mock.MagicMock()
    cm.__exit__.return_value = False
    return cm


def _http_error(code: int, body: bytes = b""):
    return urllib.error.HTTPError(
        "https://proj.supabase.co/x", code, "err", {}, io.BytesIO(body)
    )


class LocalBackendTests(unittest.TestCase):
    def test_local_backend_passes_when_writable(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        with override_settings(storage_backend="local", upload_dir=tmp):
            self.assertEqual(vs.run(write_test=False), 0)


class SupabaseConfigTests(unittest.TestCase):
    _SUPA = dict(
        storage_backend="supabase",
        supabase_url="https://proj.supabase.co",
        supabase_service_role_key="svc-key",
        supabase_storage_bucket="gatherarc-flyers",
    )

    def test_missing_credentials_fails(self):
        with override_settings(
            storage_backend="supabase",
            supabase_url="",
            supabase_service_role_key="",
        ):
            self.assertEqual(vs.run(write_test=False), 1)

    def test_healthy_read_only_check_passes(self):
        with override_settings(**self._SUPA):
            with mock.patch.object(
                storage.urllib.request, "urlopen", return_value=_cm()
            ):
                self.assertEqual(vs.run(write_test=False), 0)

    def test_healthy_write_test_passes(self):
        with override_settings(**self._SUPA):
            with mock.patch.object(
                storage.urllib.request, "urlopen", return_value=_cm()
            ):
                self.assertEqual(vs.run(write_test=True), 0)

    def test_missing_bucket_fails(self):
        with override_settings(**self._SUPA):
            with mock.patch.object(
                storage.urllib.request,
                "urlopen",
                side_effect=_http_error(404, b'{"message":"Bucket not found"}'),
            ):
                self.assertEqual(vs.run(write_test=False), 1)

    def test_write_test_failure_fails(self):
        # Bucket check succeeds (GET) but the probe upload fails (POST).
        calls = {"n": 0}

        def fake_urlopen(req, *a, **k):
            calls["n"] += 1
            if req.get_method() == "GET":
                return _cm()  # bucket check ok
            raise _http_error(403)  # write probe denied

        with override_settings(**self._SUPA):
            with mock.patch.object(
                storage.urllib.request, "urlopen", side_effect=fake_urlopen
            ):
                self.assertEqual(vs.run(write_test=True), 1)


if __name__ == "__main__":
    unittest.main()
