"""Unit tests for the flyer storage abstraction.

Standard-library `unittest` only (no pytest / no live Supabase project). Run
from the backend/ directory:

    python -m unittest tests.test_storage -v
"""

import contextlib
import io
import logging
import shutil
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from app import storage
from app.config import settings
from app.storage import (
    ALLOWED_IMAGE_TYPES,
    BUCKET_NOT_FOUND,
    STORAGE_AUTH_FAILED,
    STORAGE_PERMISSION_DENIED,
    STORAGE_PROVIDER_ERROR,
    STORAGE_TIMEOUT,
    LocalStorage,
    StorageError,
    SupabaseStorage,
    classify_http_status,
    get_storage,
    resolve_flyer_url,
)


def _http_error(code: int, body: bytes = b""):
    """Build a urllib HTTPError with a readable body (for category tests)."""
    return urllib.error.HTTPError(
        "https://proj.supabase.co/x", code, "err", {}, io.BytesIO(body)
    )


@contextlib.contextmanager
def override_settings(**kwargs):
    """Temporarily override attributes on the shared settings singleton."""
    old = {k: getattr(settings, k) for k in kwargs}
    for k, v in kwargs.items():
        setattr(settings, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(settings, k, v)


def _cm(return_value=None):
    """A MagicMock usable as a context manager (for mocking urlopen)."""
    cm = mock.MagicMock()
    cm.__enter__.return_value = return_value or mock.MagicMock()
    cm.__exit__.return_value = False
    return cm


class LocalStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.store = LocalStorage(self.tmp)

    def test_save_writes_file(self):
        self.store.save("flyers/e1/a.png", b"data", "image/png")
        p = Path(self.tmp) / "flyers" / "e1" / "a.png"
        self.assertTrue(p.exists())
        self.assertEqual(p.read_bytes(), b"data")

    def test_url_is_media_relative_by_default(self):
        with override_settings(media_base_url=""):
            self.assertEqual(self.store.url("flyers/e1/a.png"), "/media/flyers/e1/a.png")

    def test_url_respects_media_base_url(self):
        with override_settings(media_base_url="https://cdn.example.com/"):
            self.assertEqual(
                self.store.url("k/x.png"), "https://cdn.example.com/media/k/x.png"
            )

    def test_delete_removes_file(self):
        self.store.save("k/x.png", b"1", "image/png")
        self.store.delete("k/x.png")
        self.assertFalse((Path(self.tmp) / "k" / "x.png").exists())

    def test_delete_missing_is_silent(self):
        # Deleting a flyer that is already gone must not raise.
        self.store.delete("nope/none.png")

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(StorageError):
            self.store.save("../evil.png", b"x", "image/png")
        with self.assertRaises(StorageError):
            self.store.delete("../../etc/passwd")


class SupabaseStorageTests(unittest.TestCase):
    def _adapter(self):
        return SupabaseStorage("https://proj.supabase.co", "svc-key", "flyers")

    def test_requires_url_and_key(self):
        with self.assertRaises(StorageError):
            SupabaseStorage("", "key", "flyers")
        with self.assertRaises(StorageError):
            SupabaseStorage("https://proj.supabase.co", "", "flyers")

    def test_save_posts_with_auth_and_upsert(self):
        captured = {}

        def fake_urlopen(req, *a, **k):
            captured["req"] = req
            return _cm()

        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            self._adapter().save("flyers/e1/a.png", b"bytes", "image/png")

        req = captured["req"]
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(
            req.full_url,
            "https://proj.supabase.co/storage/v1/object/flyers/flyers/e1/a.png",
        )
        self.assertEqual(req.data, b"bytes")
        headers = {k.lower(): v for k, v in req.header_items()}
        self.assertEqual(headers["authorization"], "Bearer svc-key")
        self.assertEqual(headers["apikey"], "svc-key")
        self.assertEqual(headers["content-type"], "image/png")
        self.assertEqual(headers["x-upsert"], "true")

    def test_delete_issues_http_delete(self):
        captured = {}

        def fake_urlopen(req, *a, **k):
            captured["req"] = req
            return _cm()

        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            self._adapter().delete("flyers/e1/a.png")

        self.assertEqual(captured["req"].get_method(), "DELETE")
        self.assertEqual(
            captured["req"].full_url,
            "https://proj.supabase.co/storage/v1/object/flyers/flyers/e1/a.png",
        )

    def test_public_url_uses_public_object_path(self):
        self.assertEqual(
            self._adapter().url("flyers/e1/a.png"),
            "https://proj.supabase.co/storage/v1/object/public/flyers/flyers/e1/a.png",
        )

    def test_public_url_respects_media_base_url(self):
        with override_settings(media_base_url="https://cdn.example.com"):
            self.assertEqual(
                self._adapter().url("flyers/e1/a.png"),
                "https://cdn.example.com/flyers/e1/a.png",
            )

    def test_save_wraps_network_errors(self):
        with mock.patch.object(
            storage.urllib.request,
            "urlopen",
            side_effect=urllib.error.URLError("boom"),
        ):
            with self.assertRaises(StorageError):
                self._adapter().save("k.png", b"x", "image/png")


class GetStorageTests(unittest.TestCase):
    def test_default_backend_is_local(self):
        with override_settings(storage_backend="local"):
            self.assertIsInstance(get_storage(), LocalStorage)

    def test_supabase_backend_selected(self):
        with override_settings(
            storage_backend="supabase",
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="key",
            supabase_storage_bucket="flyers",
        ):
            self.assertIsInstance(get_storage(), SupabaseStorage)


class ResolveFlyerUrlTests(unittest.TestCase):
    def test_uploaded_flyer_wins(self):
        with override_settings(storage_backend="local", media_base_url=""):
            self.assertEqual(
                resolve_flyer_url("flyers/e/a.png", "http://ext/img.png"),
                "/media/flyers/e/a.png",
            )

    def test_falls_back_to_external_url(self):
        self.assertEqual(
            resolve_flyer_url("", "http://ext/img.png"), "http://ext/img.png"
        )

    def test_empty_when_nothing_set(self):
        self.assertEqual(resolve_flyer_url("", ""), "")


class AllowedTypesTests(unittest.TestCase):
    def test_supported_image_types(self):
        self.assertEqual(ALLOWED_IMAGE_TYPES["image/png"], "png")
        self.assertEqual(ALLOWED_IMAGE_TYPES["image/jpeg"], "jpg")
        self.assertEqual(ALLOWED_IMAGE_TYPES["image/webp"], "webp")
        self.assertNotIn("text/plain", ALLOWED_IMAGE_TYPES)
        self.assertNotIn("application/pdf", ALLOWED_IMAGE_TYPES)


class ClassifyHttpStatusTests(unittest.TestCase):
    def test_status_to_category(self):
        self.assertEqual(classify_http_status(401), STORAGE_AUTH_FAILED)
        self.assertEqual(classify_http_status(403), STORAGE_PERMISSION_DENIED)
        self.assertEqual(classify_http_status(404), BUCKET_NOT_FOUND)
        self.assertEqual(classify_http_status(500), STORAGE_PROVIDER_ERROR)

    def test_400_bucket_not_found_body_detected(self):
        self.assertEqual(
            classify_http_status(400, '{"message":"Bucket not found"}'),
            BUCKET_NOT_FOUND,
        )

    def test_400_other_is_generic(self):
        self.assertEqual(
            classify_http_status(400, "some other validation error"),
            STORAGE_PROVIDER_ERROR,
        )


class SupabaseErrorCategoryTests(unittest.TestCase):
    def _adapter(self, bucket="gatherarc-flyers"):
        return SupabaseStorage("https://proj.supabase.co", "svc-key-SECRET", bucket)

    def test_missing_bucket_raises_bucket_not_found(self):
        with mock.patch.object(
            storage.urllib.request,
            "urlopen",
            side_effect=_http_error(404, b'{"message":"Bucket not found"}'),
        ):
            with self.assertRaises(StorageError) as ctx:
                self._adapter().save("flyers/e/a.png", b"x", "image/png")
        self.assertEqual(ctx.exception.category, BUCKET_NOT_FOUND)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_auth_failure_categorized(self):
        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=_http_error(401)
        ):
            with self.assertRaises(StorageError) as ctx:
                self._adapter().save("k.png", b"x", "image/png")
        self.assertEqual(ctx.exception.category, STORAGE_AUTH_FAILED)

    def test_permission_denied_categorized(self):
        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=_http_error(403)
        ):
            with self.assertRaises(StorageError) as ctx:
                self._adapter().save("k.png", b"x", "image/png")
        self.assertEqual(ctx.exception.category, STORAGE_PERMISSION_DENIED)

    def test_timeout_categorized(self):
        with mock.patch.object(
            storage.urllib.request,
            "urlopen",
            side_effect=urllib.error.URLError(TimeoutError("timed out")),
        ):
            with self.assertRaises(StorageError) as ctx:
                self._adapter().save("k.png", b"x", "image/png")
        self.assertEqual(ctx.exception.category, STORAGE_TIMEOUT)

    def test_service_key_never_in_error_message_or_logs(self):
        # Neither the raised StorageError nor the emitted logs may contain the
        # service-role key or the raw provider body.
        with self.assertLogs("gatherarc.storage", level="WARNING") as logs:
            with mock.patch.object(
                storage.urllib.request,
                "urlopen",
                side_effect=_http_error(404, b'{"secret-ish":"svc-key-SECRET body"}'),
            ):
                with self.assertRaises(StorageError) as ctx:
                    self._adapter().save("k.png", b"x", "image/png")
        blob = str(ctx.exception) + "\n".join(logs.output)
        self.assertNotIn("svc-key-SECRET", blob)
        self.assertNotIn("Bearer", blob)
        # But the sanitized category IS present for diagnosis.
        self.assertIn(BUCKET_NOT_FOUND, "\n".join(logs.output))


class SupabaseBucketCheckTests(unittest.TestCase):
    def _adapter(self):
        return SupabaseStorage("https://proj.supabase.co", "svc-key", "gatherarc-flyers")

    def test_check_reachable_ok(self):
        with mock.patch.object(storage.urllib.request, "urlopen", return_value=_cm()):
            self.assertIsNone(self._adapter().check_reachable())

    def test_check_reachable_missing_bucket(self):
        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=_http_error(404)
        ):
            with self.assertRaises(StorageError) as ctx:
                self._adapter().check_reachable()
        self.assertEqual(ctx.exception.category, BUCKET_NOT_FOUND)


class ExactBucketNameTests(unittest.TestCase):
    def test_configured_bucket_used_exactly_in_object_url(self):
        captured = {}

        def fake_urlopen(req, *a, **k):
            captured["url"] = req.full_url
            return _cm()

        with mock.patch.object(
            storage.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            SupabaseStorage("https://proj.supabase.co", "k", "gatherarc-flyers").save(
                "flyers/e/a.png", b"x", "image/png"
            )
        self.assertIn(
            "/storage/v1/object/gatherarc-flyers/flyers/e/a.png", captured["url"]
        )

    def test_public_url_uses_exact_bucket(self):
        adapter = SupabaseStorage("https://proj.supabase.co", "k", "gatherarc-flyers")
        with override_settings(media_base_url=""):
            self.assertEqual(
                adapter.url("flyers/e/a.png"),
                "https://proj.supabase.co/storage/v1/object/public/gatherarc-flyers/flyers/e/a.png",
            )


class LocalCheckReachableTests(unittest.TestCase):
    def test_local_dir_is_writable(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        LocalStorage(tmp).check_reachable()  # must not raise


if __name__ == "__main__":
    unittest.main()
