from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings
from app.core.flaresolverr import flarefetch
from app.db.cache_store import cache_client
from app.sources import StreamCandidateModel

_CLOCK_CACHE_TTL = 315360000  # permanent
_PROBE_CACHE_TTL = 300   # 5 minutes

# Shared connection pool reused across all resolver calls.
_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=15),
        )
    return _http_client


@dataclass
class ResolvedStream:
    url: str
    kind: str
    resolution: Optional[str] = None


class StreamResolverError(RuntimeError):
    pass


_PROBE_HEADERS = {
    "Referer": settings.allanime_referer,
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}
_MEDIA_CTS = (
    "video/",
    "audio/",
    "application/octet-stream",
    "application/vnd.apple.mpegurl",
)


async def _probe_url(url: str) -> tuple[str, str, int] | None:
    """Return (final_url, content_type, status_code). Result is cached."""
    cache_key = f"filim:probe:{hashlib.md5(url.encode()).hexdigest()}"
    try:
        cached = await cache_client.get(cache_key)
        if cached:
            d = json.loads(cached)
            return d["url"], d["ct"], d["status"]
    except Exception:
        pass

    try:
        client = _get_http_client()
        resp = await client.head(url, headers=_PROBE_HEADERS)
        if resp.status_code >= 400:
            resp = await client.get(
                url, headers={**_PROBE_HEADERS, "Range": "bytes=0-0"}
            )
        final_url = str(resp.url)
        ct = resp.headers.get("content-type", "").lower()
        result = (final_url, ct, resp.status_code)
        try:
            await cache_client.setex(
                cache_key,
                _PROBE_CACHE_TTL,
                json.dumps({"url": final_url, "ct": ct, "status": resp.status_code}),
            )
        except Exception:
            pass
        return result
    except Exception:
        return None


def _to_clock_json_url(url: str) -> str:
    if "/clock/dr" in url:
        return url.replace("/clock/dr", "/clock.json")
    if "/clock" in url and "/clock.json" not in url:
        return url.replace("/clock", "/clock.json")
    return url


async def clear_clock_cache_for_candidates(candidates: list[StreamCandidateModel]) -> None:
    """Delete cached clock JSON for candidates, forcing fresh CDN URL resolution on next play."""
    for candidate in candidates:
        if "apivtwo/clock" not in candidate.url:
            continue
        clock_url = _to_clock_json_url(candidate.url)
        cache_key = f"filim:clock:{hashlib.md5(clock_url.encode()).hexdigest()}"
        try:
            await cache_client.delete(cache_key)
        except Exception:
            pass


class StreamResolver:
    """Resolve provider URLs into direct media URLs.

    Fully asynchronous; uses a module-level httpx connection pool and a
    semaphore to cap concurrent yt-dlp subprocess invocations.
    """

    _semaphore = asyncio.Semaphore(8)

    def __init__(self, yt_dlp_binary: str = "yt-dlp") -> None:
        self.yt_dlp_binary = yt_dlp_binary

    async def _fetch_clock_json(self, clock_url: str) -> dict:
        cache_key = f"filim:clock:{hashlib.md5(clock_url.encode()).hexdigest()}"
        try:
            cached = await cache_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        clock_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
            ),
            "Referer": settings.allanime_referer,
        }
        data = None
        try:
            client = _get_http_client()
            resp = await client.get(clock_url, headers=clock_headers)
            if resp.status_code != 403:
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            pass

        if data is None:
            data = await flarefetch(clock_url)

        if not data:
            raise StreamResolverError(f"Failed to resolve provider clock URL: {clock_url}")

        try:
            await cache_client.setex(cache_key, _CLOCK_CACHE_TTL, json.dumps(data))
        except Exception:
            logging.warning("Failed to cache clock JSON for %s", clock_url)

        return data

    async def resolve(
        self, candidate: StreamCandidateModel, preferred_quality: Optional[str] = None
    ) -> ResolvedStream:
        url = candidate.url

        if "apivtwo/clock" in url:
            clock_url = _to_clock_json_url(url)

            data = await self._fetch_clock_json(clock_url)
            links = data.get("links") or []
            if not links:
                raise StreamResolverError("Provider clock JSON contained no links")

            def resolution_score(entry: dict) -> int:
                label = str(entry.get("resolutionStr") or "").lower()
                for token in ("2160", "1440", "1080", "720", "480", "360"):
                    if token in label:
                        return int(token)
                return 0

            chosen_entry = max(links, key=resolution_score)
            stream_url = chosen_entry.get("link") or chosen_entry.get("src")
            if not stream_url:
                raise StreamResolverError("Provider clock link entry missing URL")

            kind = "hls" if ".m3u8" in stream_url else "file"
            return ResolvedStream(
                url=stream_url,
                kind=kind,
                resolution=chosen_entry.get("resolutionStr") or candidate.resolution,
            )

        if any(
            ext in url for ext in (".m3u8", ".mp4", ".webm", ".mkv", ".avi", ".mov")
        ):
            kind = "hls" if ".m3u8" in url else "file"
            return ResolvedStream(url=url, kind=kind, resolution=candidate.resolution)

        # Probe Content-Type — result is cached to avoid repeat HTTP round-trips.
        probe = await _probe_url(url)
        if probe is not None:
            final_url, ct, status = probe
            is_media_ct = any(ct.startswith(m) for m in _MEDIA_CTS)
            has_media_ext = any(
                ext in final_url for ext in (".m3u8", ".mp4", ".webm", ".mkv")
            )
            if status < 400 and (is_media_ct or has_media_ext):
                stream_url = final_url if (has_media_ext or is_media_ct) else url
                kind = "hls" if ".m3u8" in stream_url else "file"
                return ResolvedStream(
                    url=stream_url, kind=kind, resolution=candidate.resolution
                )

        format_selector = "best"
        if preferred_quality:
            h = "".join(ch for ch in preferred_quality if ch.isdigit())
            if h:
                format_selector = f"best[height<={h}]/best"

        cmd = [self.yt_dlp_binary, "-g", "-f", format_selector, url]

        proc = None
        try:
            async with self._semaphore:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
                except asyncio.TimeoutError as exc:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    raise StreamResolverError(f"yt-dlp resolution timed out for: {url}") from exc
                except asyncio.CancelledError:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    raise
        except (StreamResolverError, asyncio.CancelledError):
            raise
        except (OSError, Exception) as exc:
            raise StreamResolverError(
                f"yt-dlp failed to start or error occurred: {exc}"
            ) from exc

        if proc.returncode != 0:
            raise StreamResolverError(
                f"yt-dlp failed with code {proc.returncode}"
            )

        out_text = (stdout.decode() or "").strip()
        if not out_text:
            raise StreamResolverError("yt-dlp returned no URLs")

        resolved_url = out_text.splitlines()[0].strip()
        if not resolved_url:
            raise StreamResolverError("yt-dlp produced an empty URL")

        kind = "hls" if ".m3u8" in resolved_url else "file"
        return ResolvedStream(
            url=resolved_url, kind=kind, resolution=candidate.resolution
        )
