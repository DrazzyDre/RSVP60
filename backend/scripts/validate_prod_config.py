"""Validate the current environment against RSVP60's production guards.

Run this in the TARGET environment (with the real env vars set) before a deploy,
from the backend/ directory:

    APP_ENV=production python -m scripts.validate_prod_config

Exits 0 when the configuration passes every runtime guard, non-zero with a clear
message otherwise. Prints a MASKED summary — it never echoes secret values.
"""

import sys

from app.config import UNSAFE_JWT_DEFAULT, Settings


def _mask(value: str) -> str:
    return "<set>" if value else "<empty>"


def main() -> int:
    s = Settings()
    db_kind = "sqlite" if s.database_url.startswith("sqlite") else "postgres/other"
    jwt_state = (
        "<DEFAULT — INSECURE>" if s.jwt_secret == UNSAFE_JWT_DEFAULT else "<set>"
    )

    print("RSVP60 configuration check")
    print(f"  APP_ENV                   = {s.app_env}")
    print(f"  DATABASE_URL              = {_mask(s.database_url)} ({db_kind})")
    print(f"  JWT_SECRET                = {jwt_state}")
    print(f"  ACCESS_TOKEN_EXPIRE_MIN   = {s.access_token_expire_minutes}")
    print(f"  SITE_URL                  = {s.site_url or '<empty>'}")
    print(f"  CORS_ORIGINS              = {s.cors_origin_list}")
    print(f"  TRUST_PROXY_HEADERS       = {s.trust_proxy_headers}")
    print(f"  STORAGE_BACKEND           = {s.storage_backend}")
    print(f"  SUPABASE_URL              = {s.supabase_url or '<empty>'}")
    print(f"  SUPABASE_SERVICE_ROLE_KEY = {_mask(s.supabase_service_role_key)}")
    print(f"  SUPABASE_STORAGE_BUCKET   = {s.supabase_storage_bucket}")
    print(f"  EMAIL_BACKEND             = {s.email_backend_name}")
    print(f"  EMAIL_FROM_ADDRESS        = {s.email_from_address or '<empty>'}")
    print(f"  RESEND_API_KEY            = {_mask(s.resend_api_key)}")

    if not s.is_production:
        print(
            "\nNote: APP_ENV is not 'production' — production-only guards "
            "(SITE_URL/CORS/JWT/provider credentials) are relaxed."
        )

    try:
        s.validate_runtime()
    except RuntimeError as exc:
        print(f"\nFAIL: {exc}")
        return 1

    print("\nOK: configuration passes all runtime guards.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
