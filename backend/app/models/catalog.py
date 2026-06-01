from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Show(Base):
    __tablename__ = "shows"

    source_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    english_title: Mapped[str | None] = mapped_column(String, nullable=True)
    alt_names: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    slug: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    synopsis: Mapped[str | None] = mapped_column(Text, nullable=True)
    genres: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    episode_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    poster_url: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)

    provider_raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="show",
        cascade="all, delete-orphan",
    )


class Episode(Base):
    __tablename__ = "episodes"

    show_id: Mapped[str] = mapped_column(
        ForeignKey("shows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    episode_no: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    air_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    provider_raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    show: Mapped[Show] = relationship(back_populates="episodes")


class ShowStats(Base):
    __tablename__ = "show_stats"

    show_id: Mapped[str] = mapped_column(
        ForeignKey("shows.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    device_count_30d: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    watch_time_sum_30d: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
    )
    is_trending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_show_stats_trending_score", "is_trending", "device_count_30d"),
    )
