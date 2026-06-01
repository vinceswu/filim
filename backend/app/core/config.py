from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from app.core import constants

_BACKEND_DIR = Path(__file__).parent.parent.parent

# Load environment-specific .env file. ENVIRONMENT must already be set in the
# shell (via run.sh / dev.sh) before Python starts so the right file is picked.
_env_name = os.environ.get("ENVIRONMENT", "development")
load_dotenv(_BACKEND_DIR / f".env.{_env_name}")


class Settings:
    def __init__(self):
        self.environment: str = os.environ.get("ENVIRONMENT", "development")
        self.debug: bool = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

        self.host: str = constants.DEFAULT_HOST
        self.port: int = constants.DEFAULT_PORT

        self.allanime_api_url: str = os.environ.get("ALLANIME_API_URL", constants.ALLANIME_API_URL)
        self.allanime_base_url: str = constants.ALLANIME_BASE_URL
        self.allanime_referer: str = constants.ALLANIME_REFERER
        self.http_timeout_seconds: float = constants.HTTP_TIMEOUT_SECONDS

        self.trending_window_days: int = constants.TRENDING_WINDOW_DAYS
        self.log_level: str = os.environ.get("LOG_LEVEL", constants.DEFAULT_LOG_LEVEL)

        self.flaresolverr_url: str = os.environ.get("FLARESOLVERR_URL", "http://localhost:8191/v1")

        _cors = os.environ.get("CORS_ORIGINS", "*")
        self.cors_origins: list[str] = [o.strip() for o in _cors.split(",") if o.strip()]

    @property
    def project_root(self) -> str:
        return os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )

    @property
    def database_url(self) -> str:
        db_path = os.path.join(self.project_root, "filim.db")
        return f"sqlite+aiosqlite:///{db_path}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
