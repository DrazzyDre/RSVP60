"""Validate GatherArc flyer-storage configuration in the TARGET environment.

Run from the backend/ directory with the real env vars set (e.g. in the Render
Shell) BEFORE trying a live flyer upload:

    python -m scripts.validate_storage               # read-only reachability check
    python -m scripts.validate_storage --write-test  # also upload+delete a probe

It:
  * confirms the configured backend and that required variables are present,
  * confirms the bucket exists / is reachable with the current credentials,
  * with ``--write-test``, uploads a tiny generated probe object under a
    dedicated ``_validation/`` path and immediately deletes it,
  * prints only MASKED, safe summaries — never the service-role key or the raw
    provider response,
  * exits 0 on success, non-zero on the first failure.

The write test is OFF by default so a routine check never mutates storage.
"""

import argparse
import sys

from app.config import settings
from app.models import new_uuid
from app.storage import (
    LocalStorage,
    StorageError,
    SupabaseStorage,
    get_storage,
)

# 1x1 transparent PNG — the smallest valid image to prove a real write path.
_PROBE_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d49444154789c6360000002000154a24f6f0000000049454e44ae426082"
)


def _mask(value: str) -> str:
    return "<set>" if value else "<empty>"


def _print_summary() -> None:
    print("GatherArc storage configuration check")
    print(f"  STORAGE_BACKEND           = {settings.storage_backend}")
    if settings.is_supabase_storage:
        print(f"  SUPABASE_URL              = {settings.supabase_url or '<empty>'}")
        print(f"  SUPABASE_SERVICE_ROLE_KEY = {_mask(settings.supabase_service_role_key)}")
        print(f"  SUPABASE_STORAGE_BUCKET   = {settings.supabase_storage_bucket}")
    else:
        print(f"  UPLOAD_DIR                = {settings.upload_dir}")
        print(f"  MEDIA_BASE_URL            = {settings.media_base_url or '<empty>'}")


def _write_test(storage) -> None:
    """Upload then immediately delete a tiny probe object. Raises on failure."""
    key = f"_validation/probe-{new_uuid()}.png"
    print("  write test                -> uploading probe object ...")
    storage.save(key, _PROBE_PNG, "image/png")
    print("  write test                -> deleting probe object ...")
    storage.delete(key)
    print("  write test                = OK (upload + delete succeeded)")


def run(write_test: bool = False) -> int:
    _print_summary()

    # Required-variable check up front (get_storage would raise, but this gives a
    # clearer message).
    if settings.is_supabase_storage and not (
        settings.supabase_url and settings.supabase_service_role_key
    ):
        print(
            "\nFAIL: STORAGE_BACKEND=supabase requires SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY (server-only secret)."
        )
        return 1

    try:
        storage = get_storage()
    except StorageError as exc:
        print(f"\nFAIL [{exc.category}]: {exc}")
        return 1

    # Reachability: bucket exists (supabase) or upload dir writable (local).
    try:
        if isinstance(storage, (SupabaseStorage, LocalStorage)):
            storage.check_reachable()
            target = (
                f"bucket '{settings.supabase_storage_bucket}'"
                if settings.is_supabase_storage
                else f"upload dir '{settings.upload_dir}'"
            )
            print(f"  reachability              = OK ({target} reachable)")
    except StorageError as exc:
        print(f"\nFAIL [{exc.category}]: storage is not reachable.")
        if exc.category == "bucket_not_found":
            print(
                "  Hint: create a PUBLIC bucket whose name EXACTLY matches "
                "SUPABASE_STORAGE_BUCKET, then redeploy the backend."
            )
        return 1

    if write_test:
        try:
            _write_test(storage)
        except StorageError as exc:
            print(f"\nFAIL [{exc.category}]: probe write/delete failed.")
            return 1

    print("\nOK: storage configuration passes all checks.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate GatherArc flyer-storage configuration."
    )
    parser.add_argument(
        "--write-test",
        action="store_true",
        help="Also upload and immediately delete a tiny probe object.",
    )
    args = parser.parse_args()
    return run(write_test=args.write_test)


if __name__ == "__main__":
    sys.exit(main())
