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
"""

from __future__ import annotations

import logging
import os
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


class StorageError(RuntimeError):
    """Raised when a storage backend cannot complete an operation."""


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
            raise StorageError("Invalid storage key.")
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


class SupabaseStorage:
    """Store files in a Supabase Storage bucket via the REST API."""

    def __init__(self, base_url: str, service_key: str, bucket: str) -> None:
        if not base_url or not service_key:
            raise StorageError(
                "STORAGE_BACKEND=supabase requires SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY to be set."
            )
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.bucket = bucket

    def _object_url(self, key: str) -> str:
        return f"{self.base_url}/storage/v1/object/{self.bucket}/{key}"

    def save(self, key: str, data: bytes, content_type: str) -> None:
        req = urllib.request.Request(
            self._object_url(key),
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.service_key}",
                "apikey": self.service_key,
                "Content-Type": content_type,
                # Overwrite if the object already exists (flyer replace).
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(req):
                pass
        except urllib.error.HTTPError as exc:  # pragma: no cover - network
            # Log status only (never the request headers, which carry the key).
            logger.warning("Supabase upload failed: HTTP %s", exc.code)
            raise StorageError(
                f"Supabase upload failed ({exc.code}): {exc.read().decode()[:200]}"
            ) from exc
        except urllib.error.URLError as exc:  # pragma: no cover - network
            logger.warning("Supabase upload error: %s", exc.reason)
            raise StorageError(f"Supabase upload failed: {exc.reason}") from exc

    def delete(self, key: str) -> None:
        req = urllib.request.Request(
            self._object_url(key),
            method="DELETE",
            headers={
                "Authorization": f"Bearer {self.service_key}",
                "apikey": self.service_key,
            },
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
