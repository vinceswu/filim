import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import CatalogService
from app.core.utils import proxy_img_url as _proxy_img
from app.db.session import get_db
from app.sources import EpisodeSummaryModel
from app.streams.service import bust_show_stream_cache


class ShowSummaryResponse(BaseModel):
    id: str | None = None
    title: str
    episode_count: int
    poster_image_url: str | None = None
    banner_image_url: str | None = None
    synopsis: str | None = None
    tags: list[str] = []
    available_audio_languages: list[str] = []

    @classmethod
    def from_source(cls, src: Any) -> "ShowSummaryResponse":
        if isinstance(src, dict):
            return cls(
                id=src.get("id"),
                title=src.get("title", ""),
                episode_count=src.get("episode_count", 0),
                poster_image_url=_proxy_img(src.get("poster_image_url")),
                banner_image_url=_proxy_img(src.get("banner_image_url")),
                synopsis=src.get("synopsis"),
                tags=src.get("tags", []),
                available_audio_languages=src.get("available_audio_languages", []),
            )

        return cls(
            id=src.id,
            title=src.title,
            episode_count=src.episode_count,
            poster_image_url=_proxy_img(src.poster_image_url),
            banner_image_url=_proxy_img(src.banner_image_url),
            synopsis=src.synopsis,
            tags=src.tags,
            available_audio_languages=src.available_audio_languages,
        )


class EpisodeSummaryResponse(BaseModel):
    number: str
    title: str | None = None
    duration_seconds: int | None = None

    @classmethod
    def from_source(cls, src: EpisodeSummaryModel) -> "EpisodeSummaryResponse":
        return cls(
            number=src.number,
            title=src.title,
            duration_seconds=src.duration_seconds,
        )


class ShowDetailsResponse(BaseModel):
    id: str | None = None
    title: str
    episode_count: int
    episodes: list[EpisodeSummaryResponse]
    synopsis: str | None = None
    tags: list[str] = []
    cover_image_url: str | None = None
    status: str | None = None
    available_audio_languages: list[str] = []


router = APIRouter()


def _get_catalog_service(db: AsyncSession = Depends(get_db)) -> CatalogService:
    return CatalogService(db=db)


@router.get("/search")
async def search_catalog(
    q: str = Query(""),
    page: int = Query(1, ge=1),
    genres: str | None = Query(None),
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    genre_list = [g.strip() for g in genres.split(",") if g.strip()] if genres else None
    if genre_list is not None:
        genre_list = [g for g in genre_list if g]
    if not q.strip() and not genre_list:
        raise HTTPException(
            status_code=422,
            detail="Provide a non-empty q and/or at least one genre",
        )
    items = await catalog.search(query=q.strip(), mode=mode, page=page, genres=genre_list)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}


@router.get("/trending")
async def get_trending(
    page: int = Query(1, ge=1),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    items = await catalog.get_trending(page=page)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}


@router.get("/shows")
async def get_shows(
    page: int = Query(1, ge=1),
    limit: int = Query(40, ge=1, le=100),
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    items = await catalog.get_shows(limit=limit, page=page, mode=mode)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}


@router.get("/movies")
async def get_movies(
    page: int = Query(1, ge=1),
    limit: int = Query(40, ge=1, le=100),
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    items = await catalog.get_movies(limit=limit, page=page, mode=mode)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}


@router.get("/{show_id}")
async def get_show_details(
    show_id: str,
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    q: str | None = Query(None, min_length=1),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> ShowDetailsResponse:
    details = await catalog.get_show_details(
        show_id=show_id,
        mode=mode,
        search_query=q,
    )
    episodes = await catalog.get_episode_list(
        show_id=show_id,
        mode=mode,
        search_query=q,
    )

    if (not details.title and details.episode_count == 0) and not episodes:
        raise HTTPException(status_code=404, detail="Show not found")

    # Proactively refresh stream cache for first + last episode so CDN URLs are
    # warm before the user hits play.
    if episodes:
        ep_nums = {episodes[0].number}
        if len(episodes) > 1:
            ep_nums.add(episodes[-1].number)
        for ep in ep_nums:
            asyncio.create_task(bust_show_stream_cache(show_id, ep))

    return ShowDetailsResponse(
        id=details.id,
        title=details.title,
        episode_count=details.episode_count,
        episodes=[EpisodeSummaryResponse.from_source(e) for e in episodes],
        synopsis=details.synopsis,
        tags=details.tags,
        cover_image_url=_proxy_img(details.banner_image_url or details.poster_image_url),
        status=None,
        available_audio_languages=details.available_audio_languages,
    )


@router.get("/{show_id}/episodes")
async def get_show_episodes(
    show_id: str,
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[EpisodeSummaryResponse]]:
    episodes = await catalog.get_episode_list(show_id=show_id, mode=mode)
    return {"items": [EpisodeSummaryResponse.from_source(e) for e in episodes]}


@router.get("/{show_id}/series")
async def get_show_series(
    show_id: str,
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    items = await catalog.get_series_lineup(show_id=show_id, mode=mode)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}


@router.get("/{show_id}/similar")
async def get_show_similar(
    show_id: str,
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    limit: int = Query(12, ge=1, le=30),
    catalog: CatalogService = Depends(_get_catalog_service),
) -> dict[str, list[ShowSummaryResponse]]:
    items = await catalog.get_similar_shows(show_id=show_id, mode=mode, limit=limit)
    return {"items": [ShowSummaryResponse.from_source(i) for i in items]}
