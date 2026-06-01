from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AppSettings(Base):
    __tablename__ = "app_settings"

    admin_password_hash: Mapped[str] = mapped_column(String, nullable=False)
    admin_token: Mapped[str | None] = mapped_column(String, nullable=True)
    admin_token_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    allow_creating_profiles: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    guest_profile_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_profiles: Mapped[int | None] = mapped_column(Integer, nullable=True)
    require_profile_pins: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_concurrent_streams: Mapped[int | None] = mapped_column(Integer, nullable=True)
