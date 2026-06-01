from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import Select, and_, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Show, WatchProgress

logger = logging.getLogger(__name__)


class WatchProgressModel(BaseModel):
    show_id: str | None = None
    episode: str
    position_seconds: float
    duration_seconds: float
    last_updated: datetime
    is_finished: bool
    show_title: str | None = None
    cover_image_url: str | None = None


@dataclass
class SessionService:
    db: AsyncSession

    async def resolve_device(
        self,
        device_token: str | None,
        client_ip: str | None,
    ) -> Device:
        """Resolve a Device using an explicit token or fallback identification.

        Commits the device immediately so it is guaranteed to exist
        for foreign-key checks in the same or subsequent transactions.
        """
        token = device_token or client_ip or "anonymous"

        stmt: Select[tuple[Device]] = select(Device).where(Device.mac_address == token)
        result = await self.db.execute(stmt)
        device = result.scalar_one_or_none()
        if device is not None:
            return device

        new_device = Device(mac_address=token, device_name=None)
        self.db.add(new_device)
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()

        result = await self.db.execute(stmt)
        device = result.scalar_one_or_none()
        if device is None:
            raise ValueError(f"Could not resolve device for token {token!r}")
        return device

    async def update_progress(
        self,
        device_token: str | None,
        client_ip: str | None,
        profile_id: str | None,
        show_id: str,
        episode: str,
        position_seconds: float,
        duration_seconds: float,
        is_finished: bool | None,
    ) -> None:
        def is_valid_uuid(val: str) -> bool:
            try:
                uuid.UUID(str(val))
                return True
            except (ValueError, TypeError):
                return False

        if not profile_id or not is_valid_uuid(profile_id):
            profile_id = None
            is_guest = False
        else:
            from app.models.profiles import Profile

            profile_row = await self.db.get(Profile, profile_id)
            if not profile_row:
                logger.warning(
                    "Stale profile_id %r, falling back to device-level", profile_id
                )
                profile_id = None
                is_guest = False
            else:
                is_guest = profile_row.is_guest

        if is_guest:
            return

        try:
            device = await self.resolve_device(
                device_token=device_token,
                client_ip=client_ip,
            )
        except (ValueError, Exception) as exc:
            logger.warning("Could not resolve device: %s", exc)
            return

        finished = bool(is_finished)
        if is_finished is None and duration_seconds > 0:
            ratio = position_seconds / duration_seconds
            finished = ratio >= 0.9

        now = datetime.now(timezone.utc)
        try:
            stmt = insert(WatchProgress).values(
                device_id=device.id,
                profile_id=profile_id,
                show_id=show_id,
                episode=episode,
                position_seconds=position_seconds,
                duration_seconds=duration_seconds,
                is_finished=finished,
                last_updated=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["device_id", "profile_id", "show_id", "episode"],
                set_={
                    "position_seconds": position_seconds,
                    "duration_seconds": duration_seconds,
                    "is_finished": finished,
                    "last_updated": now,
                },
            )
            await self.db.execute(stmt)
            await self.db.commit()
        except Exception as exc:
            logger.error("Failed to persist watch progress: %s", exc)
            await self.db.rollback()

    async def get_continue_watching(
        self,
        device_token: str | None,
        client_ip: str | None,
        profile_id: str | None,
        limit: int = 20,
    ) -> list[WatchProgressModel]:
        def is_valid_uuid(val: str) -> bool:
            try:
                uuid.UUID(str(val))
                return True
            except (ValueError, TypeError):
                return False

        from sqlalchemy import func

        from app.models.profiles import Profile

        if profile_id and is_valid_uuid(profile_id):
            profile_row = await self.db.get(Profile, profile_id)
            if not profile_row:
                profile_id = None
                is_guest = False
            else:
                is_guest = profile_row.is_guest
        else:
            profile_id = None
            is_guest = False

        if is_guest:
            return []

        if profile_id is None:
            device = await self.resolve_device(
                device_token=device_token, client_ip=client_ip
            )
            history_filter = and_(
                WatchProgress.device_id == device.id,
                WatchProgress.profile_id.is_(None),
                WatchProgress.is_finished.is_(False),
            )
        else:
            history_filter = and_(
                WatchProgress.profile_id == profile_id,
                WatchProgress.is_finished.is_(False),
            )

        latest_sub = (
            select(
                WatchProgress.show_id,
                func.max(WatchProgress.last_updated).label("max_updated"),
            )
            .where(history_filter)
            .group_by(WatchProgress.show_id)
            .subquery()
        )

        stmt: Select[tuple[WatchProgress, Show]] = (
            select(WatchProgress, Show)
            .join(
                latest_sub,
                and_(
                    WatchProgress.show_id == latest_sub.c.show_id,
                    WatchProgress.last_updated == latest_sub.c.max_updated,
                ),
            )
            .join(Show, Show.source_id == WatchProgress.show_id, isouter=True)
            .where(history_filter)
            .order_by(WatchProgress.last_updated.desc())
            .limit(limit)
        )
        rows = (await self.db.execute(stmt)).all()
        items: list[WatchProgressModel] = []
        for wp, show in rows:
            items.append(
                WatchProgressModel(
                    show_id=wp.show_id,
                    episode=wp.episode,
                    position_seconds=wp.position_seconds,
                    duration_seconds=wp.duration_seconds,
                    last_updated=wp.last_updated,
                    is_finished=wp.is_finished,
                    show_title=show.title if show is not None else None,
                    cover_image_url=(
                        show.cover_image_url or show.poster_url
                        if show is not None
                        else None
                    ),
                )
            )
        return items

    async def get_show_progress(
        self,
        device_token: str | None,
        client_ip: str | None,
        profile_id: str | None,
        show_id: str,
    ) -> list[WatchProgressModel]:
        def is_valid_uuid(val: str) -> bool:
            try:
                import uuid

                uuid.UUID(str(val))
                return True
            except (ValueError, TypeError):
                return False

        from app.models.profiles import Profile

        if profile_id and is_valid_uuid(profile_id):
            profile_row = await self.db.get(Profile, profile_id)
            if not profile_row:
                profile_id = None
                is_guest = False
            else:
                is_guest = profile_row.is_guest
        else:
            profile_id = None
            is_guest = False

        if is_guest:
            return []

        if profile_id is None:
            device = await self.resolve_device(
                device_token=device_token, client_ip=client_ip
            )
            history_filter = and_(
                WatchProgress.device_id == device.id,
                WatchProgress.profile_id.is_(None),
                WatchProgress.show_id == show_id,
            )
        else:
            history_filter = and_(
                WatchProgress.profile_id == profile_id,
                WatchProgress.show_id == show_id,
            )

        stmt = select(WatchProgress).where(history_filter)
        rows = (await self.db.execute(stmt)).scalars().all()

        items: list[WatchProgressModel] = []
        for wp in rows:
            items.append(
                WatchProgressModel(
                    show_id=wp.show_id,
                    episode=wp.episode,
                    position_seconds=wp.position_seconds,
                    duration_seconds=wp.duration_seconds,
                    last_updated=wp.last_updated,
                    is_finished=wp.is_finished,
                    show_title=None,
                    cover_image_url=None,
                )
            )
        return items
