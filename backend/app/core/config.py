"""
Application configuration. All settings load from environment variables
(or a .env file in dev). Never commit real secrets.
"""
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "ForensicGuard API"
    ENVIRONMENT: str = "development"

    # Dev default: local SQLite, zero setup. Production: swap to
    # postgresql+asyncpg://user:pass@host:5432/dbname — no code changes needed.
    DATABASE_URL: str = "sqlite+aiosqlite:///./forensicguard.db"

    JWT_SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ECDSA signing keys (PEM strings). If unset, an ephemeral dev keypair
    # is generated at startup — fine for local testing, NOT for production
    # (restarting invalidates every certificate signed under the old key).
    SIGNING_PRIVATE_KEY_PEM: str | None = None
    SIGNING_PUBLIC_KEY_PEM: str | None = None

    PUBLIC_BASE_URL: str = "http://localhost:3000"

    # Additional CORS origins beyond PUBLIC_BASE_URL — comma-separated.
    # Example: "https://pramaan.ntro.gov.in,https://www.pramaan.ntro.gov.in"
    EXTRA_CORS_ORIGINS: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.PUBLIC_BASE_URL]
        if self.EXTRA_CORS_ORIGINS:
            origins += [o.strip() for o in self.EXTRA_CORS_ORIGINS.split(",") if o.strip()]
        return origins

    @field_validator("SIGNING_PRIVATE_KEY_PEM", "SIGNING_PUBLIC_KEY_PEM")
    @classmethod
    def _unescape_pem_newlines(cls, v: str | None) -> str | None:
        """.env files can't hold real multi-line values. Convention: store
        the PEM with literal \\n sequences, unescape them here."""
        if v is None:
            return v
        return v.replace("\\n", "\n")


@lru_cache
def get_settings() -> Settings:
    return Settings()
