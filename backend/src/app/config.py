from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (and backend/.env when run outside Docker)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # mysql+pymysql://user:password@host:3306/database
    database_url: str | None = None
    # Comma-separated origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
