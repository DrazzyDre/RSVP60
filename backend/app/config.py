"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# The default JWT secret shipped for local dev. It must NOT be used in
# production — `Settings.validate_runtime()` refuses to boot if it is.
UNSAFE_JWT_DEFAULT = "dev-super-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime environment: "development" | "production" (also accepts "test").
    app_env: str = "development"

    # Database
    database_url: str = "sqlite:///./rsvp60.db"

    # Auth
    jwt_secret: str = UNSAFE_JWT_DEFAULT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # Public site URL used to build shareable invite links
    site_url: str = "http://localhost:3000"

    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Email / guest communications ------------------------------------ #
    # "console" -> emails are logged (no external calls). Safe default for local
    #              dev, automated tests and CI.
    # "resend"  -> transactional email via Resend (https://resend.com). Requires
    #              RESEND_API_KEY and EMAIL_FROM_ADDRESS.
    email_backend: str = "console"
    email_from_address: str = ""
    email_from_name: str = "RSVP60"
    # Provider API key — a SERVER-ONLY secret. Never sent to the frontend and
    # never stored in the communication log.
    resend_api_key: str = ""
    # Hard cap on how long a single provider send may block (synchronous send).
    email_timeout_seconds: int = 10

    # --- Flyer / image storage ------------------------------------------- #
    # "local"  -> files saved under `upload_dir`, served from `/media/...`.
    # "supabase" -> files pushed to a Supabase Storage bucket (see below).
    storage_backend: str = "local"
    # Local disk directory for uploads (relative to the backend working dir).
    upload_dir: str = "uploads"
    # Public URL prefix used to build absolute media links. Leave blank for
    # local storage (the app returns "/media/..." paths the frontend resolves
    # against the API origin). For Supabase this is set automatically.
    media_base_url: str = ""
    # Max upload size (bytes) and the image types we accept.
    max_upload_bytes: int = 5 * 1024 * 1024  # 5 MB
    # Supabase Storage (only used when storage_backend == "supabase").
    # The service role key is a SERVER-ONLY secret — it is never sent to the
    # frontend and is used solely for backend upload/delete operations.
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "flyers"

    # Simple in-memory rate limit for public RSVP submissions (per client IP).
    rsvp_rate_limit_max: int = 8
    rsvp_rate_limit_window_seconds: int = 60

    # Failed admin-login throttle (per client IP + email). Blocks brute force
    # without affecting normal authenticated API usage. In-process only — use a
    # shared store (Redis) for multi-instance production (see README).
    login_rate_limit_max_failures: int = 5
    login_rate_limit_window_seconds: int = 300

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def is_supabase_storage(self) -> bool:
        return self.storage_backend.lower() == "supabase"

    @property
    def email_backend_name(self) -> str:
        return (self.email_backend or "console").lower()

    @property
    def is_email_provider_live(self) -> bool:
        """True when a real (non-console) email provider is selected."""
        return self.email_backend_name not in ("", "console", "log")

    @property
    def email_provider_configured(self) -> bool:
        """Whether the selected backend has everything it needs to send.

        Console is always 'configured'. A live provider needs its API key and a
        from-address.
        """
        if not self.is_email_provider_live:
            return True
        if self.email_backend_name == "resend":
            return bool(self.resend_api_key and self.email_from_address)
        return False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_runtime(self) -> None:
        """Refuse to run with unsafe or incomplete configuration.

        Called on application startup. Keeps dev friction-free while making it
        impossible to accidentally deploy with the shipped demo secret or a
        half-configured storage backend.
        """
        if self.is_production and self.jwt_secret == UNSAFE_JWT_DEFAULT:
            raise RuntimeError(
                "JWT_SECRET is still the insecure default. Set a strong, unique "
                "JWT_SECRET (e.g. `openssl rand -hex 32`) before running in "
                "production (APP_ENV=production)."
            )
        if self.is_supabase_storage and not (
            self.supabase_url and self.supabase_service_role_key
        ):
            raise RuntimeError(
                "STORAGE_BACKEND=supabase requires SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY to be set (the service role key is a "
                "server-only secret; never expose it to the frontend)."
            )
        # A live email provider must be fully configured before we run in
        # production — otherwise confirmations/reminders would silently fail.
        if (
            self.is_production
            and self.is_email_provider_live
            and not self.email_provider_configured
        ):
            raise RuntimeError(
                f"EMAIL_BACKEND={self.email_backend_name} requires its provider "
                "credentials. For Resend set RESEND_API_KEY and EMAIL_FROM_ADDRESS. "
                "The API key is a server-only secret; never expose it to the "
                "frontend. Use EMAIL_BACKEND=console for local dev and tests."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
