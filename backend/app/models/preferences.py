from __future__ import annotations

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.profiles import Profile


class ProfileListEntry(Base):
    __tablename__ = "profile_list_entries"

    profile_id: Mapped[str] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    show_id: Mapped[str] = mapped_column(String, nullable=False)

    profile: Mapped[Profile] = relationship(back_populates="list_entries")

    __table_args__ = (
        UniqueConstraint(
            "profile_id",
            "show_id",
            name="uq_profile_list_profile_show",
        ),
    )


class ProfileRating(Base):
    __tablename__ = "profile_ratings"

    profile_id: Mapped[str] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    show_id: Mapped[str] = mapped_column(String, nullable=False)
    rating: Mapped[str] = mapped_column(String, nullable=False)

    profile: Mapped[Profile] = relationship(back_populates="ratings")

    __table_args__ = (
        UniqueConstraint(
            "profile_id",
            "show_id",
            name="uq_profile_rating_profile_show",
        ),
    )


class ProfileAudioPreference(Base):
    __tablename__ = "profile_audio_preferences"

    profile_id: Mapped[str] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    audio_language_id: Mapped[str] = mapped_column(String, nullable=False)

    profile: Mapped[Profile] = relationship(back_populates="audio_preferences")

    __table_args__ = (
        UniqueConstraint(
            "profile_id",
            name="uq_profile_audio_pref_profile",
        ),
    )
