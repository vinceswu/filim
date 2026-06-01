from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.devices import WatchProgress
    from app.models.preferences import (
        ProfileAudioPreference,
        ProfileListEntry,
        ProfileRating,
    )


class Profile(Base):
    __tablename__ = "profiles"

    name: Mapped[str] = mapped_column(String, nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_concurrent_streams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    watch_progress: Mapped[list["WatchProgress"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    list_entries: Mapped[list["ProfileListEntry"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    ratings: Mapped[list["ProfileRating"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    audio_preferences: Mapped[list["ProfileAudioPreference"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
    )
