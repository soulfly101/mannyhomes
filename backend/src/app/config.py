from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (and backend/.env when run outside Docker)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # mysql+pymysql://user:password@host:3306/database
    database_url: str | None = None
    # Comma-separated origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:5173"
    # Where the React app lives; Google sign-in sends people back here.
    frontend_url: str = "http://localhost:5173"
    # Signs short-lived values like the Google sign-in state. Use a long random value in production.
    secret_key: str = "dev-only-insecure-secret-change-me"

    session_cookie_name: str = "altheo_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_days: int = 90

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:5173/api/auth/google/callback"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
