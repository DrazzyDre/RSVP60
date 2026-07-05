"""Pluggable flyer/image storage.

Two backends selected by ``STORAGE_BACKEND``:

* ``local``    — files written under ``UPLOAD_DIR`` and served by the API from
  ``/media/<key>`` (see ``main.py``). This is the zero-config default for local
  dev and Docker.
* ``supabase`` — files pushed to a Supabase Storage bucket via its REST API.
  Enabled by setting ``STORAGE_BACKEND=supabase`` plus ``SUPABASE_URL`` and
  ``SUPABASE_SERVICE_ROLE_KEY``. Uses only the standard library (no SDK
  dependency). The service role key is used server-side only.

The router code depends only on the small ``StorageBackend`` interface, so
swapping backends never touches business logic.

Failures raise ``StorageError`` carrying a *sanitized category* (never the raw
provider response, auth header or service-role key) so operators can diagnose a
misconfiguration from the logs while guests only ever see a generic message.
"""

from __future__ import annotations

import logging
import socket
import urllib.error
import urllib.request
from pathlib import Path
from typing import Protocol

from .config import settings

logger = logging.getLogger("gatherarc.storage")

# Accepted image types -> canonical file extension.
ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# --- Sanitized failure categories ------------------------------------------- #
# Stable, non-sensitive strings used in logs and mapped to safe admin messages.
BUCKET_NOT_FOUND = "bucket_not_found"
STORAGE_AUTH_FAILED = "storage_authentication_failed"
STORAGE_PERMISSION_DENIED = "storage_permission_denied"
STORAGE_TIMEOUT = "storage_timeout"
STORAGE_PROVIDER_ERROR = "storage_provider_error"
INVALID_FILE = "invalid_file"
UPLOAD_TOO_LARGE = "upload_too_large"


class StorageError(RuntimeError):
    """Raised when a storage backend cannot complete an operation.

    ``category`` is one of the sanitized constants above; ``status_code`` is the
    provider HTTP status when known. Neither field ever carries secrets or the
    raw provider body.
    """

    def __init__(
        self,
        message: str,
        category: str = STORAGE_PROVIDER_ERROR,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.category = category
        self.status_code = status_code


def classify_http_status(code: int | None, body_snippet: str = "") -> str:
    """Map a provider HTTP status (+ a short, already-sanitized body hint) to a
    sanitized failure category. Never receives or returns secrets."""
    hint = (body_snippet or "").lower()
    if code in (401,):
        return STORAGE_AUTH_FAILED
    if code in (403,):
        return STORAGE_PERMISSION_DENIED
    if code in (404,):
        return BUCKET_NOT_FOUND
    if code in (413,):
        return UPLOAD_TOO_LARGE
    # Supabase returns 400 with a "Bucket not found" message when the bucket
    # name does not exist — surface that specific, common misconfiguration.
    if code == 400 and ("bucket not found" in hint or "not_found" in hint):
        return BUCKET_NOT_FOUND
    return STORAGE_PROVIDER_ERROR


class StorageBackend(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, key: str) -> None: ...

    def url(self, key: str) -> str: ...


def _media_prefix() -> str:
    """Absolute prefix for building media URLs, or '' for app-relative paths."""
    return settings.media_base_url.rstrip("/")


class LocalStorage:
    """Store files on the local filesystem, served from ``/media/<key>``."""

    def __init__(self, base_dir: str) -> None:
        self.base = Path(base_dir)

    def _path(self, key: str) -> Path:
        # Guard against path traversal (keys are app-generated, but be safe).
        target = (self.base / key).resolve()
        base = self.base.resolve()
        if base not in target.parents and target != base:
            raise StorageError("Invalid storage key.", category=INVALID_FILE)
        return target

    def save(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError:
            # Deleting a flyer that is already gone must not break the request.
            pass

    def url(self, key: str) -> str:
        return f"{_media_prefix()}/media/{key}"

    def check_reachable(self) -> None:
        """Confirm the upload directory exists and is writable (validation)."""
        try:
            self.base.mkdir(parents=True, exist_ok=True)
            probe = self.base / ".write_probe"
            probe.write_bytes(b"ok")
            probe.unlink(missing_ok=True)
        except OSError as exc:
            raise StorageError(
                f"Upload directory is not writable: {self.base}",
                category=STORAGE_PROVIDER_ERROR,
            ) from exc


class SupabaseStorage:
    """Store files in a Supabase Storage bucket via the REST API."""

    def __init__(self, base_url: str, service_key: str, bucket: str) -> None:
        if not base_url or not service_key:
            raise StorageError(
                "STORAGE_BACKEND=supabase requires SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY to be set.",
                category=STORAGE_PROVIDER_ERROR,
            )
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.bucket = bucket

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
        }

    def _object_url(self, key: str) -> str:
        return f"{self.base_url}/storage/v1/object/{self.bucket}/{key}"

    def _bucket_info_url(self) -> str:
        return f"{self.base_url}/storage/v1/bucket/{self.bucket}"

    def _raise_http(self, exc: urllib.error.HTTPError, op: str) -> None:
        # Read a SHORT, sanitized snippet only to classify the failure. It is
        # never logged or returned to the client (which sees a generic message).
        try:
            snippet = exc.read().decode("utf-8", "replace")[:200]
        except Exception:  # pragma: no cover - defensive
            snippet = ""
        category = classify_http_status(exc.code, snippet)
        # Log status + category only — never headers (they carry the key) or body.
        logger.warning(
            "Supabase %s failed: status=%s category=%s", op, exc.code, category
        )
        raise StorageError(
            f"Supabase {op} failed ({exc.code}).",
            category=category,
            status_code=exc.code,
        ) from exc

    def _raise_url_error(self, exc: urllib.error.URLError, op: str) -> None:
        timed_out = isinstance(exc.reason, (TimeoutError, socket.timeout))
        category = STORAGE_TIMEOUT if timed_out else STORAGE_PROVIDER_ERROR
        logger.warning("Supabase %s error: category=%s", op, category)
        raise StorageError(
            f"Supabase {op} failed: network error.", category=category
        ) from exc

    def save(self, key: str, data: bytes, content_type: str) -> None:
        req = urllib.request.Request(
            self._object_url(key),
            data=data,
            method="POST",
            headers={
                **self._auth_headers(),
                "Content-Type": content_type,
                # Overwrite if the object already exists (flyer replace).
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(req):
                pass
        except urllib.error.HTTPError as exc:  # pragma: no cover - network
            self._raise_http(exc, "upload")
        except urllib.error.URLError as exc:  # pragma: no cover - network
            self._raise_url_error(exc, "upload")

    def delete(self, key: str) -> None:
        req = urllib.request.Request(
            self._object_url(key),
            method="DELETE",
            headers=self._auth_headers(),
        )
        try:
            with urllib.request.urlopen(req):
                pass
        except urllib.error.URLError:  # pragma: no cover - network
            # Best-effort delete; never break the request over a missing object.
            pass

    def url(self, key: str) -> str:
        prefix = _media_prefix()
        if prefix:
            return f"{prefix}/{key}"
        return f"{self.base_url}/storage/v1/object/public/{self.bucket}/{key}"

    def check_reachable(self) -> None:
        """Confirm the bucket exists / is reachable with the current key.

        Used by the storage-validation command. Raises ``StorageError`` with a
        sanitized category on failure; returns ``None`` when the bucket resolves.
        """
        req = urllib.request.Request(
            self._bucket_info_url(), method="GET", headers=self._auth_headers()
        )
        try:
            with urllib.request.urlopen(req):
                return None
        except urllib.error.HTTPError as exc:  # pragma: no cover - network
            self._raise_http(exc, "bucket check")
        except urllib.error.URLError as exc:  # pragma: no cover - network
            self._raise_url_error(exc, "bucket check")


def get_storage() -> StorageBackend:
    """Return the configured storage backend."""
    if settings.is_supabase_storage:
        return SupabaseStorage(
            settings.supabase_url,
            settings.supabase_service_role_key,
            settings.supabase_storage_bucket,
        )
    return LocalStorage(settings.upload_dir)


def ensure_local_upload_dir() -> str | None:
    """Create the local upload directory if the local backend is active.

    Returns the absolute path when local storage is in use, else ``None``.
    """
    if settings.is_supabase_storage:
        return None
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return str(path.resolve())


def resolve_flyer_url(flyer_storage_path: str, flyer_url: str) -> str:
    """Public image URL for an event: uploaded flyer wins over external URL."""
    if flyer_storage_path:
        return get_storage().url(flyer_storage_path)
    return flyer_url or ""
