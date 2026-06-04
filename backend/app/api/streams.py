from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import DEFAULT_USER_AGENT
from app.db.session import get_db
from app.models import Profile
from app.models.devices import Device, WatchProgress
from app.models.settings import AppSettings
from app.models.streams import AudioLanguageModel, StreamResponseModel
from app.streams.service import StreamService

_PROXY_HEADERS = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Referer": settings.allanime_referer,
    "Origin": settings.allanime_referer.rstrip("/"),
}
# Shared client reuses TCP connections across proxy requests.
_proxy_client = httpx.AsyncClient(
    timeout=settings.http_timeout_seconds,
    follow_redirects=True,
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
)

router = APIRouter()


def _get_stream_service() -> StreamService:
    return StreamService()


def _resolve_language_and_mode(
    mode: str,
    language: Optional[str],
) -> tuple[str, str]:
    if language in {"ja", "en"}:
        resolved_language = language
    else:
        resolved_language = "en" if mode == "dub" else "ja"

    effective_mode = "dub" if resolved_language == "en" else "sub"
    return resolved_language, effective_mode


_ALLOWED_IMAGE_HOSTS = {"api.allanime.day", "wp.allanime.day"}


@router.get("/image")
async def proxy_image(url: str = Query(...)) -> Response:
    """Proxy allanime image assets that are Cloudflare-blocked for direct browser access."""
    target_url = url
    parsed = urlparse(target_url)
    if parsed.hostname not in _ALLOWED_IMAGE_HOSTS:
        raise HTTPException(status_code=400, detail="Disallowed image host")

    try:
        resp = await _proxy_client.get(target_url, headers=_PROXY_HEADERS)
        if resp.status_code == 403:
            # Some CDN paths don't enforce hotlink protection — retry without Referer.
            minimal = {"User-Agent": _PROXY_HEADERS["User-Agent"]}
            resp = await _proxy_client.get(target_url, headers=minimal)
        if resp.status_code >= 400:
            raise HTTPException(status_code=404, detail="Image not found upstream")
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/jpeg"),
            headers={"cache-control": "public, max-age=86400"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Image proxy error: {exc}"
        ) from exc


@router.get("/proxy")
async def proxy_stream(request: Request, url: str = Query(...)) -> StreamingResponse:
    """Proxy a CDN media URL with the correct Referer/UA headers.

    Required because providers like tools.fast4speed.rsvp enforce hotlink
    protection — only requests with Referer: allanime.to are allowed.
    The browser cannot set Referer arbitrarily, so we proxy here.
    Supports Range requests for seeking.
    """
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    upstream_headers = dict(_PROXY_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    async def _stream():
        async with _proxy_client.stream("GET", url, headers=upstream_headers) as resp:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk

    return StreamingResponse(
        _stream(),
        status_code=206 if range_header else 200,
        media_type="application/octet-stream",
    )


async def _check_concurrent_stream_limit(
    profile_id: str | None,
    device_token: str | None,
    db: AsyncSession,
) -> None:
    if not profile_id or not device_token:
        return

    app_settings = await db.get(AppSettings, "singleton")
    profile = await db.get(Profile, profile_id)
    if profile is None:
        return

    # Per-profile limit overrides global; None means unlimited
    limit = profile.max_concurrent_streams
    if limit is None and app_settings:
        limit = app_settings.max_concurrent_streams
    if limit is None:
        return

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    # Find current device by token
    device_row = (
        await db.execute(select(Device).where(Device.mac_address == device_token))
    ).scalar_one_or_none()
    current_device_id = device_row.id if device_row else None

    # Active device_ids streaming on this profile in the last 5 minutes
    active_stmt = (
        select(WatchProgress.device_id)
        .where(
            WatchProgress.profile_id == profile_id,
            WatchProgress.last_updated >= cutoff,
            WatchProgress.is_finished == False,  # noqa: E712
        )
        .distinct()
    )
    active_ids = set((await db.execute(active_stmt)).scalars().all())

    # If this device is already streaming, it's a continuation — allow
    if current_device_id and current_device_id in active_ids:
        return

    if len(active_ids) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Stream limit reached: {limit} simultaneous stream(s) allowed for this profile",
        )


@router.get("/{show_id}/episodes/{episode}/stream")
async def get_episode_stream(
    show_id: str,
    episode: str,
    mode: str = Query("sub", pattern="^(sub|dub)$"),
    language: Optional[str] = Query(None, pattern="^(ja|en)$"),
    quality: Optional[str] = Query(None),
    variant: Optional[str] = Query(
        None,
        description="Preferred stream variant id from the API list (e.g. v0, v1).",
        pattern="^v[0-9]+$",
    ),
    refresh: bool = Query(
        False, description="Bust clock cache and re-resolve CDN URLs."
    ),
    device_token: Optional[str] = Query(None),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> StreamResponseModel:
    profile_id = request.headers.get("X-Profile-Id") if request else None
    await _check_concurrent_stream_limit(profile_id, device_token, db)

    service = _get_stream_service()

    resolved_language, effective_mode = _resolve_language_and_mode(
        mode=mode,
        language=language,
    )

    try:
        manifest_url, variants = await service.get_hls_manifest_for_episode(
            show_id=show_id,
            episode=episode,
            mode=effective_mode,
            preferred_quality=quality,
            device_token=device_token,
            variant_id=variant,
            force_refresh=refresh,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc) or "No stream candidates available",
        ) from exc

    # Direct MP4/file URLs require hotlink-correct headers the browser can't set.
    # Route them through the backend proxy so Referer/UA are injected server-side.
    is_hls = ".m3u8" in manifest_url
    if not is_hls:
        manifest_url = f"/api/v1/stream/proxy?url={quote(manifest_url, safe='')}"

    if resolved_language == "en":
        audio_label = "English"
    else:
        audio_label = "日本語"

    audio_languages = [
        AudioLanguageModel(
            id=resolved_language,
            code=resolved_language,
            label=audio_label,
            is_default=True,
        )
    ]

    return StreamResponseModel(
        manifest_url=manifest_url,
        variants=variants,
        audio_languages=audio_languages,
    )
