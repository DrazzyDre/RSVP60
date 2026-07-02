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
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "flyers"

    # Simple in-memory rate limit for public RSVP submissions (per client IP).
    rsvp_rate_limit_max: int = 8
    rsvp_rate_limit_window_seconds: int = 60

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_runtime(self) -> None:
        """Refuse to run with unsafe defaults in production.

        Called on application startup. Keeps dev friction-free while making it
        impossible to accidentally deploy with the shipped demo secret.
        """
        if self.is_production and self.jwt_secret == UNSAFE_JWT_DEFAULT:
            raise RuntimeError(
                "JWT_SECRET is still the insecure default. Set a strong, unique "
                "JWT_SECRET (e.g. `openssl rand -hex 32`) before running in "
                "production (APP_ENV=production)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
