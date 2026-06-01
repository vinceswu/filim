from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Profile


class ProfileModel(BaseModel):
    id: str
    name: str
    is_locked: bool
    is_guest: bool
    created_at: datetime

    class Config:
        from_attributes = True


def _hash_pin(pin: str, salt: str) -> str:
    """Return a salted hash for a numeric PIN."""
    payload = f"{salt}:{pin}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class ProfileService:
    db: AsyncSession

    async def list_profiles(self) -> list[ProfileModel]:
        stmt = select(Profile).order_by(Profile.created_at.asc())
        rows = (await self.db.execute(stmt)).scalars().all()
        return [ProfileModel.model_validate(row) for row in rows]

    async def get_profile(self, profile_id: str) -> ProfileModel | None:
        profile = await self.db.get(Profile, profile_id)
        if profile is None:
            return None
        return ProfileModel.model_validate(profile)

    async def create_profile(self, name: str, pin: str | None = None) -> ProfileModel:
        from uuid import uuid4

        if pin is not None and (len(pin) != 4 or not pin.isdigit()):
            raise ValueError("PIN must be exactly 4 digits")
        profile_id = str(uuid4())
        pin_hash = _hash_pin(pin, profile_id) if pin else None
        profile = Profile(
            id=profile_id,
            name=name,
            pin_hash=pin_hash,
            is_locked=bool(pin_hash),
        )
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)
        return ProfileModel.model_validate(profile)

    async def update_profile(
        self,
        profile_id: str,
        *,
        name: str | None = None,
        pin: str | None | object = object(),
    ) -> ProfileModel:
        profile = await self.db.get(Profile, profile_id)
        if profile is None:
            raise ValueError("Profile not found")

        if name is not None:
            profile.name = name

        if pin is not object():
            if pin:
                profile.pin_hash = _hash_pin(str(pin), profile.id)
                profile.is_locked = True
            else:
                profile.pin_hash = None
                profile.is_locked = False

        await self.db.commit()
        await self.db.refresh(profile)
        return ProfileModel.model_validate(profile)

    async def delete_profile(self, profile_id: str) -> None:
        profile = await self.db.get(Profile, profile_id)
        if profile is None:
            return
        if profile.is_guest:
            raise ValueError("Guest profile cannot be deleted")
        await self.db.delete(profile)
        await self.db.commit()

    async def verify_pin(self, profile_id: str, pin: str) -> bool:
        profile = await self.db.get(Profile, profile_id)
        if profile is None or not profile.pin_hash:
            return False
        return profile.pin_hash == _hash_pin(pin, profile.id)
