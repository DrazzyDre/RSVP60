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
