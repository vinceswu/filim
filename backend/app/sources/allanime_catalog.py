from __future__ import annotations

import base64
import hashlib
import html
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from pydantic import BaseModel

from app.core.cache import cache_response
from app.core.config import settings
from app.core.constants import DEFAULT_USER_AGENT, MODE_SUB, genres_for_upstream_api
from app.core.flaresolverr import flarefetch
from app.core.utils import normalize_genre_list
from app.sources.queries import (
    EPISODE_LIST_QUERY,
    EPISODE_METADATA_QUERY,
    SEARCH_SHOWS_QUERY,
    SHOW_DETAILS_QUERY,
)


class ShowSummaryModel(BaseModel):
    id: str | None = None
    title: str
    english_title: str | None = None
    episode_count: int
    synopsis: str | None = None
    tags: list[str] = []
    poster_image_url: str | None = None
    banner_image_url: str | None = None
    type: str | None = None

    available_audio_languages: list[str] = []
    related_shows: list[dict[str, Any]] = []
    alt_names: list[str] = []


class EpisodeSummaryModel(BaseModel):
    number: str
    title: str | None = None
    duration_seconds: int | None = None


class StreamCandidateModel(BaseModel):
    provider: str
    kind: str
    resolution: str | None = None
    url: str
    has_subtitles: bool = False
    referer: str | None = None
    priority: float = 0.0


@dataclass
class _AllanimeGraphqlClient:
    base_url: str
    referer: str
    timeout: float
    # CF blocks direct requests — skip direct attempt entirely, always use FlareSolverr.
    _cf_blocked: bool = True

    async def query(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        params = {
            "query": query,
            "variables": json.dumps(variables, separators=(",", ":")),
        }

        if not self._cf_blocked:
            data = await self._direct_query(params)
            if data:
                return data
            self._cf_blocked = True

        # Fall back to FlareSolverr (bypasses CF JS challenge)
        logging.info("Direct request blocked, retrying via FlareSolverr")
        data = await flarefetch(self.base_url, params)
        if not data:
            return {}

        if "errors" in data:
            logging.error(f"GraphQL returns errors: {data['errors']}")
            return {}

        inner = data.get("data", {})

        to_be_parsed = inner.get("tobeparsed")
        if to_be_parsed:
            try:
                decrypted = _decrypt_tobeparsed(to_be_parsed)
                return decrypted
            except Exception as exc:
                logging.error(f"Failed to decrypt tobeparsed: {exc}")
                return {}

        return inner

    async def _direct_query(self, params: dict[str, str]) -> dict[str, Any]:
        origin = self.referer.rstrip("/")
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "User-Agent": DEFAULT_USER_AGENT,
                    "Referer": self.referer,
                    "Origin": origin,
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Sec-Fetch-Site": "cross-site",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "empty",
                },
                timeout=self.timeout,
            ) as client:
                response = await client.get("", params=params)
                if response.status_code == 403:
                    return {}
                response.raise_for_status()
        except httpx.HTTPError:
            return {}

        try:
            data = response.json()
        except Exception:
            return {}

        if "errors" in data:
            logging.error(f"GraphQL returns errors: {data['errors']}")
            return {}
        return data.get("data", {})


_ALLANIME_AES_KEY = hashlib.sha256(b"Xot36i3lK3:v1").digest()


def _decrypt_tobeparsed(tobeparsed: str) -> dict[str, Any]:
    """Decrypt AES-256-CTR encrypted episode data returned by the allanime API."""
    raw = base64.b64decode(tobeparsed)
    iv = raw[1:13]
    ctr_nonce = iv + bytes([0, 0, 0, 2])
    ct_len = len(raw) - 13 - 16
    ciphertext = raw[13 : 13 + ct_len]
    cipher = Cipher(algorithms.AES(_ALLANIME_AES_KEY), modes.CTR(ctr_nonce))
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return json.loads(plaintext)


def _decode_source_url(url: str) -> str:
    """Decode XOR-obfuscated source URLs (prefix '--' + hex, XOR key 56)."""
    if url.startswith("--"):
        try:
            return bytes(b ^ 56 for b in bytes.fromhex(url[2:])).decode("utf-8")
        except Exception:
            return url
    return url


def strip_html(text: str | None) -> str | None:
    if not text:
        return text
    text = html.unescape(text)
    text = re.sub(r"<(br\s*/?|/p)>", "\n", text, flags=re.IGNORECASE)
    return re.sub(r"<[^>]+>", "", text).strip()


def _normalized_tags(raw: list[str] | None) -> list[str]:
    return normalize_genre_list(list(raw or []))


# Per-worker singleton — preserves _cf_blocked state across requests so
# failed direct attempts aren't retried for the worker's lifetime.
_adapter_singleton: "AllanimeCatalogAdapter | None" = None


def get_catalog_adapter() -> "AllanimeCatalogAdapter":
    global _adapter_singleton
    if _adapter_singleton is None:
        _adapter_singleton = AllanimeCatalogAdapter()
    return _adapter_singleton


class AllanimeCatalogAdapter:
    """Search, episodes, and stream URLs against the allanime.day GraphQL API."""

    def __init__(self) -> None:
        self._client = _AllanimeGraphqlClient(
            base_url=settings.allanime_api_url,
            referer=settings.allanime_referer,
            timeout=settings.http_timeout_seconds,
        )

    @cache_response(ttl_seconds=315360000, response_model=ShowSummaryModel)
    async def search_shows(
        self,
        query: str,
        mode: str = MODE_SUB,
        page: int = 1,
        genres: list[str] | None = None,
        show_type: str | None = None,
    ) -> list[ShowSummaryModel]:
        variables = {
            "search": {
                "query": query,
                "allowAdult": False,
                "allowUnknown": False,
            },
            "limit": 40,
            "page": page,
            "translationType": mode,
            "countryOrigin": "ALL",
        }
        if genres:
            variables["search"]["genres"] = genres_for_upstream_api(genres)
        if show_type:
            variables["search"]["type"] = show_type
        data = await self._client.query(SEARCH_SHOWS_QUERY, variables)
        edges = data.get("shows", {}).get("edges", []) or []
        results: list[ShowSummaryModel] = []
        for edge in edges:
            episodes_detail = edge.get("availableEpisodesDetail") or {}
            episode_count = len(episodes_detail.get(mode, []) or [])

            languages: list[str] = []
            if episodes_detail.get("sub"):
                languages.append("ja")
            if episodes_detail.get("dub"):
                languages.append("en")

            thumb = edge.get("thumbnail") or None
            if thumb and not thumb.startswith("http"):
                thumb = f"https://api.allanime.day{thumb}"
            source_id = edge.get("_id")
            title = edge.get("englishName") or edge.get("name") or ""
            results.append(
                ShowSummaryModel(
                    id=str(source_id) if source_id else None,
                    title=title,
                    english_title=edge.get("englishName"),
                    episode_count=episode_count,
                    synopsis=strip_html(edge.get("description")) or None,
                    tags=_normalized_tags(edge.get("genres")),
                    poster_image_url=thumb,
                    banner_image_url=edge.get("banner"),
                    available_audio_languages=languages,
                    alt_names=list(edge.get("altNames") or []),
                    type=edge.get("type"),
                )
            )
        return results

    @cache_response(ttl_seconds=315360000, response_model=ShowSummaryModel)
    async def get_popular_shows(
        self,
        limit: int = 20,
        page: int = 1,
        mode: str = MODE_SUB,
        genres: list[str] | None = None,
        show_type: str | None = None,
    ) -> list[ShowSummaryModel]:
        variables = {
            "search": {
                "query": "",
                "allowAdult": False,
                "allowUnknown": True,
            },
            "limit": limit,
            "page": page,
            "translationType": mode,
            "countryOrigin": "ALL",
        }
        if genres:
            variables["search"]["genres"] = genres_for_upstream_api(genres)
        if show_type:
            variables["search"]["type"] = show_type
        data = await self._client.query(SEARCH_SHOWS_QUERY, variables)
        edges = data.get("shows", {}).get("edges", []) or []
        results: list[ShowSummaryModel] = []
        for edge in edges:
            episodes_detail = edge.get("availableEpisodesDetail") or {}
            episode_count = len(episodes_detail.get(mode, []) or [])

            languages: list[str] = []
            if episodes_detail.get("sub"):
                languages.append("ja")
            if episodes_detail.get("dub"):
                languages.append("en")

            thumb = edge.get("thumbnail") or None
            if thumb and not thumb.startswith("http"):
                thumb = f"https://api.allanime.day{thumb}"
            source_id = edge.get("_id")
            title = edge.get("englishName") or edge.get("name") or ""
            results.append(
                ShowSummaryModel(
                    id=str(source_id) if source_id else None,
                    title=title,
                    english_title=edge.get("englishName"),
                    episode_count=episode_count,
                    synopsis=strip_html(edge.get("description")) or None,
                    tags=_normalized_tags(edge.get("genres")),
                    poster_image_url=thumb,
                    banner_image_url=edge.get("banner"),
                    available_audio_languages=languages,
                    alt_names=list(edge.get("altNames") or []),
                    type=edge.get("type"),
                )
            )
        return results

    @cache_response(ttl_seconds=315360000, response_model=ShowSummaryModel)
    async def get_show_details(
        self,
        show_id: str,
        mode: str = MODE_SUB,
    ) -> ShowSummaryModel:
        variables = {"id": show_id}
        data = await self._client.query(SHOW_DETAILS_QUERY, variables)
        show = data.get("show") or {}
        episodes_detail = show.get("availableEpisodesDetail") or {}

        primary_eps = episodes_detail.get(mode, []) or []
        if not primary_eps:
            fallback_mode = "dub" if mode == "sub" else "sub"
            primary_eps = episodes_detail.get(fallback_mode, []) or []

        episode_count = len(primary_eps)

        languages: list[str] = []
        if episodes_detail.get("sub"):
            languages.append("ja")
        if episodes_detail.get("dub"):
            languages.append("en")

        thumb = show.get("thumbnail") or None
        if thumb and not thumb.startswith("http"):
            thumb = f"https://api.allanime.day{thumb}"
        source_id = show.get("_id")
        title = show.get("englishName") or show.get("name") or ""
        return ShowSummaryModel(
            id=str(source_id) if source_id else None,
            title=title,
            english_title=show.get("englishName"),
            episode_count=episode_count,
            synopsis=strip_html(show.get("description")) or None,
            tags=_normalized_tags(show.get("genres")),
            poster_image_url=thumb,
            banner_image_url=show.get("banner"),
            available_audio_languages=languages,
            related_shows=list(show.get("relatedShows") or []),
            alt_names=list(show.get("altNames") or []),
            type=show.get("type"),
        )

    @cache_response(ttl_seconds=315360000, response_model=EpisodeSummaryModel)
    async def get_episode_list(
        self,
        show_id: str,
        mode: str = MODE_SUB,
    ) -> list[EpisodeSummaryModel]:
        variables = {"id": show_id}
        data = await self._client.query(EPISODE_LIST_QUERY, variables)
        episodes_detail = data.get("show", {}).get("availableEpisodesDetail", {}) or {}

        detail = episodes_detail.get(mode, []) or []
        if not detail:
            fallback_mode = "dub" if mode == "sub" else "sub"
            detail = episodes_detail.get(fallback_mode, []) or []

        numbers = sorted({str(ep) for ep in detail})
        return [EpisodeSummaryModel(number=n) for n in numbers]

    @cache_response(ttl_seconds=315360000, response_model=StreamCandidateModel)
    async def get_stream_candidates(
        self,
        show_id: str,
        episode: str,
        mode: str = MODE_SUB,
    ) -> list[StreamCandidateModel]:
        variables = {
            "showId": show_id,
            "translationType": mode,
            "episodeString": str(episode),
        }
        data = await self._client.query(EPISODE_METADATA_QUERY, variables)
        episode_data = data.get("episode") or {}
        source_urls = episode_data.get("sourceUrls") or []

        if not source_urls:
            fallback_mode = "dub" if mode == "sub" else "sub"
            variables = {
                "showId": show_id,
                "translationType": fallback_mode,
                "episodeString": str(episode),
            }
            data = await self._client.query(EPISODE_METADATA_QUERY, variables)
            episode_data = data.get("episode") or {}
            source_urls = episode_data.get("sourceUrls") or []

        candidates: list[StreamCandidateModel] = []
        for src in source_urls:
            source_name = (src.get("sourceName") or "").lower()
            priority = float(src.get("priority") or 0)

            downloads = src.get("downloads") or {}
            raw_url = downloads.get("downloadUrl") or src.get("sourceUrl") or ""
            raw_url = _decode_source_url(raw_url)

            url, kind, resolution, has_subtitles = self._decode_provider_url(
                source_name,
                raw_url,
            )
            if not url:
                continue
            candidates.append(
                StreamCandidateModel(
                    provider=source_name,
                    kind=kind,
                    resolution=resolution,
                    url=url,
                    has_subtitles=has_subtitles,
                    referer=settings.allanime_referer,
                    priority=priority,
                )
            )
        # Sort by API priority descending so callers get highest-quality first
        candidates.sort(key=lambda c: c.priority, reverse=True)
        return candidates

    def _decode_provider_url(
        self,
        provider: str,
        encoded: str,
    ) -> tuple[str | None, str, str | None, bool]:
        url = encoded
        # Relative clock URLs are served from allanime.day base
        if url.startswith("/"):
            url = settings.allanime_base_url + url
        kind = "m3u8" if ".m3u8" in url else "mp4"

        resolution: str | None = None
        if "1080" in url:
            resolution = "1080p"
        elif "720" in url:
            resolution = "720p"
        elif "480" in url:
            resolution = "480p"
        elif "360" in url:
            resolution = "360p"

        has_subtitles = "vtt" in url or "sub" in url
        return url, kind, resolution, has_subtitles
