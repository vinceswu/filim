from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.profiles import Profile


class Device(Base):
    __tablename__ = "devices"

    mac_address: Mapped[str] = mapped_column(String, nullable=False, index=True)
    device_name: Mapped[str | None] = mapped_column(String, nullable=True)

    watch_progress: Mapped[list["WatchProgress"]] = relationship(
        back_populates="device",
        cascade="all, delete-orphan",
    )

    __table_args__ = (UniqueConstraint("mac_address", name="uq_devices_mac_address"),)


class WatchProgress(Base):
    __tablename__ = "watch_progress"

    device_id: Mapped[str] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    show_id: Mapped[str] = mapped_column(String, nullable=False)
    episode: Mapped[str] = mapped_column(String, nullable=False)
    position_seconds: Mapped[float] = mapped_column(nullable=False)
    duration_seconds: Mapped[float] = mapped_column(nullable=False)
    is_finished: Mapped[bool] = mapped_column(nullable=False, default=False)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    device: Mapped[Device] = relationship(back_populates="watch_progress")
    profile: Mapped[Profile | None] = relationship(back_populates="watch_progress")

    __table_args__ = (
        UniqueConstraint(
            "device_id",
            "profile_id",
            "show_id",
            "episode",
            name="uq_watch_progress_device_profile_show_episode",
        ),
    )
