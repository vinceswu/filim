from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.catalog import ShowSummaryResponse, _get_catalog_service
from app.catalog import CatalogService
from app.db.session import get_db
from app.preferences import (
    AudioPreferenceModel,
    PreferenceModel,
    PreferencesService,
)


class PreferenceItem(BaseModel):
    show_id: str
    in_list: bool
    rating: Optional[Literal["like", "dislike"]] = None

    @classmethod
    def from_model(cls, model: PreferenceModel) -> "PreferenceItem":
        return cls(show_id=model.show_id, in_list=model.in_list, rating=model.rating)


class UpdateListBody(BaseModel):
    show_id: str
    in_list: bool


class UpdateRatingBody(BaseModel):
    show_id: str
    rating: Optional[Literal["like", "dislike"]] = None


class AudioPreferenceItem(BaseModel):
    audio_language_id: str

    @classmethod
    def from_model(cls, model: AudioPreferenceModel) -> "AudioPreferenceItem":
        return cls(audio_language_id=model.audio_language_id)


class UpdateAudioPreferenceBody(BaseModel):
    audio_language_id: Optional[str] = None


router = APIRouter()


def _get_preferences_service(db: AsyncSession = Depends(get_db)) -> PreferencesService:
    return PreferencesService(db=db)


@router.get("/preferences")
async def get_preferences(
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
) -> dict[str, list[PreferenceItem]]:
    if not x_profile_id:
        return {"items": []}
    items = await service.get_preferences_for_profile(profile_id=x_profile_id)
    return {"items": [PreferenceItem.from_model(item) for item in items]}


@router.get("/list")
async def get_watchlist(
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    if not x_profile_id:
        return {"items": []}

    show_ids = await service.get_list_show_ids(profile_id=x_profile_id)
    if not show_ids:
        return {"items": []}

    results = []
    for sid in show_ids:
        try:
            details = await catalog.get_show_details(show_id=sid)
            results.append(ShowSummaryResponse.from_source(details))
        except Exception:
            continue

    return {"items": results}


@router.post("/preferences/list")
async def update_list_membership(
    body: UpdateListBody,
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
) -> dict[str, object]:
    if not x_profile_id:
        raise HTTPException(status_code=400, detail="Profile header required")
    item = await service.set_in_list(
        profile_id=x_profile_id,
        show_id=body.show_id,
        in_list=body.in_list,
    )
    return {"ok": True, "item": PreferenceItem.from_model(item)}


@router.post("/preferences/rating")
async def update_rating(
    body: UpdateRatingBody,
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
) -> dict[str, object]:
    if not x_profile_id:
        raise HTTPException(status_code=400, detail="Profile header required")
    item = await service.set_rating(
        profile_id=x_profile_id,
        show_id=body.show_id,
        rating=body.rating,
    )
    return {"ok": True, "item": PreferenceItem.from_model(item)}


@router.get("/audio-preference")
async def get_audio_preference(
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
) -> dict[str, Optional[AudioPreferenceItem]]:
    if not x_profile_id:
        return {"item": None}
    pref = await service.get_audio_preference_for_profile(profile_id=x_profile_id)
    if pref is None:
        return {"item": None}
    return {"item": AudioPreferenceItem.from_model(pref)}


@router.post("/audio-preference")
async def update_audio_preference(
    body: UpdateAudioPreferenceBody,
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: PreferencesService = Depends(_get_preferences_service),
) -> dict[str, Optional[AudioPreferenceItem]]:
    if not x_profile_id:
        raise HTTPException(status_code=400, detail="Profile header required")
    pref = await service.set_audio_preference(
        profile_id=x_profile_id,
        audio_language_id=body.audio_language_id,
    )
    if pref is None:
        return {"item": None}
    return {"item": AudioPreferenceItem.from_model(pref)}
