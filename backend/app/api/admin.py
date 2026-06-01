from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import AppSettings, Profile
from app.profiles.service import ProfileService

router = APIRouter()

SETTINGS_ID = "singleton"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def _get_settings(db: AsyncSession) -> AppSettings:
    s = await db.get(AppSettings, SETTINGS_ID)
    if s is None:
        raise HTTPException(500, "Settings not initialized")
    return s


async def require_admin(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> AppSettings:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    token = authorization.split(" ", 1)[1]
    s = await _get_settings(db)
    if s.admin_token != token:
        raise HTTPException(401, "Invalid token")
    if s.admin_token_expires:
        expires = s.admin_token_expires
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(401, "Token expired")
    return s


# ── Public ────────────────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    password: str


@router.post("/login")
async def admin_login(
    body: LoginBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await _get_settings(db)
    if s.admin_password_hash != _sha256(body.password):
        raise HTTPException(401, "Invalid password")
    token = str(uuid4())
    s.admin_token = token
    s.admin_token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.commit()
    return {"token": token}


@router.get("/public")
async def get_public_settings(db: AsyncSession = Depends(get_db)) -> dict:
    s = await _get_settings(db)
    return {
        "allow_creating_profiles": s.allow_creating_profiles,
        "guest_profile_enabled": s.guest_profile_enabled,
        "max_profiles": s.max_profiles,
        "require_profile_pins": s.require_profile_pins,
        "max_concurrent_streams": s.max_concurrent_streams,
    }


# ── Admin-only ────────────────────────────────────────────────────────────────

class UpdateSettingsBody(BaseModel):
    admin_password: str | None = None
    allow_creating_profiles: bool | None = None
    guest_profile_enabled: bool | None = None
    max_profiles: int | None = None
    clear_max_profiles: bool | None = None
    require_profile_pins: bool | None = None
    max_concurrent_streams: int | None = None
    clear_max_concurrent_streams: bool | None = None


class AdminSettingsResponse(BaseModel):
    allow_creating_profiles: bool
    guest_profile_enabled: bool
    max_profiles: int | None
    require_profile_pins: bool
    max_concurrent_streams: int | None


@router.get("/settings")
async def get_settings(
    s: AppSettings = Depends(require_admin),
) -> AdminSettingsResponse:
    return AdminSettingsResponse(
        allow_creating_profiles=s.allow_creating_profiles,
        guest_profile_enabled=s.guest_profile_enabled,
        max_profiles=s.max_profiles,
        require_profile_pins=s.require_profile_pins,
        max_concurrent_streams=s.max_concurrent_streams,
    )


@router.patch("/settings")
async def update_settings(
    body: UpdateSettingsBody,
    s: AppSettings = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if body.admin_password is not None:
        s.admin_password_hash = _sha256(body.admin_password)
        s.admin_token = None
        s.admin_token_expires = None

    if body.allow_creating_profiles is not None:
        s.allow_creating_profiles = body.allow_creating_profiles

    if body.guest_profile_enabled is not None:
        s.guest_profile_enabled = body.guest_profile_enabled

    if body.clear_max_profiles:
        s.max_profiles = None
    elif body.max_profiles is not None:
        s.max_profiles = max(1, body.max_profiles)

    if body.require_profile_pins is not None:
        s.require_profile_pins = body.require_profile_pins

    if body.clear_max_concurrent_streams:
        s.max_concurrent_streams = None
    elif body.max_concurrent_streams is not None:
        s.max_concurrent_streams = max(1, body.max_concurrent_streams)

    await db.commit()
    password_changed = body.admin_password is not None
    return {"status": "ok", "password_changed": password_changed}


# ── Admin profiles ────────────────────────────────────────────────────────────

class AdminProfileResponse(BaseModel):
    id: str
    name: str
    is_locked: bool
    is_guest: bool
    max_concurrent_streams: int | None


@router.get("/profiles")
async def admin_list_profiles(
    _: AppSettings = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (await db.execute(select(Profile).order_by(Profile.created_at.asc()))).scalars().all()
    return {
        "items": [
            AdminProfileResponse(
                id=r.id,
                name=r.name,
                is_locked=r.is_locked,
                is_guest=r.is_guest,
                max_concurrent_streams=r.max_concurrent_streams,
            )
            for r in rows
        ]
    }


class AdminCreateProfileBody(BaseModel):
    name: str
    pin: str | None = None


@router.post("/profiles")
async def admin_create_profile(
    body: AdminCreateProfileBody,
    _: AppSettings = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminProfileResponse:
    service = ProfileService(db=db)
    profile = await service.create_profile(name=body.name, pin=body.pin)
    return AdminProfileResponse(
        id=profile.id,
        name=profile.name,
        is_locked=profile.is_locked,
        is_guest=profile.is_guest,
        max_concurrent_streams=None,
    )


class AdminUpdateProfileBody(BaseModel):
    max_concurrent_streams: int | None = None
    clear_max_concurrent_streams: bool | None = None


@router.patch("/profiles/{profile_id}")
async def admin_update_profile(
    profile_id: str,
    body: AdminUpdateProfileBody,
    _: AppSettings = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminProfileResponse:
    profile = await db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(404, "Profile not found")
    if body.clear_max_concurrent_streams:
        profile.max_concurrent_streams = None
    elif body.max_concurrent_streams is not None:
        profile.max_concurrent_streams = max(1, body.max_concurrent_streams)
    await db.commit()
    await db.refresh(profile)
    return AdminProfileResponse(
        id=profile.id,
        name=profile.name,
        is_locked=profile.is_locked,
        is_guest=profile.is_guest,
        max_concurrent_streams=profile.max_concurrent_streams,
    )


@router.delete("/profiles/{profile_id}")
async def admin_delete_profile(
    profile_id: str,
    _: AppSettings = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    profile = await db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(404, "Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"status": "ok"}
