from __future__ import annotations

import asyncio
from typing import Optional

from pydantic import BaseModel

from app.core.cache import bust_cache_entry
from app.sources import AllanimeCatalogAdapter, StreamCandidateModel, get_catalog_adapter
from app.streams.resolver import ResolvedStream, StreamResolver, StreamResolverError, clear_clock_cache_for_candidates

_PARALLEL_CANDIDATES = 3  # race this many candidates concurrently


class StreamVariantModel(BaseModel):
    id: str
    resolution: Optional[str] = None
    provider: Optional[str] = None
    bitrate_kbps: Optional[int] = None
    kind: str


async def _resolve_first(
    candidates: list[StreamCandidateModel],
    resolver: StreamResolver,
    preferred_quality: Optional[str],
) -> tuple[ResolvedStream | None, StreamCandidateModel | None]:
    """Race candidates concurrently; return first successful resolution."""
    if not candidates:
        return None, None

    tasks: dict[asyncio.Task, StreamCandidateModel] = {
        asyncio.create_task(
            resolver.resolve(c, preferred_quality=preferred_quality)
        ): c
        for c in candidates
    }
    pending = set(tasks)

    while pending:
        done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            try:
                resolved = t.result()
                chosen = tasks[t]
                for p in pending:
                    p.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                return resolved, chosen
            except Exception:
                continue

    return None, None


async def bust_show_stream_cache(show_id: str, episode: str) -> None:
    """Background task: bust clock + candidates cache for one episode (both modes).

    Called proactively when a show detail page is viewed so CDN URLs are fresh
    before the user hits play.
    """
    adapter = get_catalog_adapter()
    for mode in ("sub", "dub"):
        try:
            candidates = await adapter.get_stream_candidates(
                show_id=show_id, episode=episode, mode=mode
            )
            if candidates:
                await asyncio.gather(
                    clear_clock_cache_for_candidates(candidates),
                    bust_cache_entry(
                        "get_stream_candidates",
                        show_id,
                        episode,
                        mode=mode,
                    ),
                    return_exceptions=True,
                )
        except Exception:
            pass


class StreamService:
    def __init__(self, source: AllanimeCatalogAdapter | None = None) -> None:
        self.source = source or get_catalog_adapter()
        self.resolver = StreamResolver()

    async def get_hls_manifest_for_episode(
        self,
        show_id: str,
        episode: str,
        mode: str,
        preferred_quality: Optional[str],
        device_token: Optional[str],
        variant_id: Optional[str] = None,
        force_refresh: bool = False,
    ) -> tuple[str, list[StreamVariantModel]]:
        # Stream candidates served from cache; resolved CDN URLs expire on their own schedule.
        candidates = await self.source.get_stream_candidates(
            show_id=show_id,
            episode=episode,
            mode=mode,
        )

        if not candidates:
            raise RuntimeError("No stream candidates available")

        if force_refresh:
            # Bust clock JSON (expired CDN URLs) and candidates (stale direct URLs) in parallel.
            await asyncio.gather(
                clear_clock_cache_for_candidates(candidates),
                bust_cache_entry("get_stream_candidates", show_id, episode, mode=mode),
                return_exceptions=True,
            )
            # Re-fetch candidates fresh after busting.
            candidates = await self.source.get_stream_candidates(
                show_id=show_id,
                episode=episode,
                mode=mode,
            )
            if not candidates:
                raise RuntimeError("No stream candidates available")

        # Candidates are already sorted by API priority (descending) from the source.
        def provider_rank(c: StreamCandidateModel) -> float:
            return -c.priority  # negate for ascending sort (highest priority first)

        ordered = sorted(candidates, key=provider_rank)

        if variant_id and variant_id.startswith("v") and len(variant_id) > 1:
            try:
                pick_idx = int(variant_id[1:])
                if 0 <= pick_idx < len(ordered):
                    chosen = ordered[pick_idx]
                    ordered = [chosen] + [
                        c for i, c in enumerate(ordered) if i != pick_idx
                    ]
            except ValueError:
                pass

        resolved: ResolvedStream | None = None
        chosen_source: StreamCandidateModel | None = None

        # Race top-N candidates concurrently; fall back sequentially for the rest.
        resolved, chosen_source = await _resolve_first(
            ordered[:_PARALLEL_CANDIDATES], self.resolver, preferred_quality
        )

        if resolved is None:
            for cand in ordered[_PARALLEL_CANDIDATES:]:
                try:
                    resolved = await self.resolver.resolve(
                        cand, preferred_quality=preferred_quality
                    )
                    chosen_source = cand
                    break
                except StreamResolverError:
                    continue

        if resolved is None or chosen_source is None:
            raise RuntimeError("No resolvable stream candidates available")

        manifest_url = resolved.url

        variants: list[StreamVariantModel] = []
        for idx, c in enumerate(ordered):
            variants.append(
                StreamVariantModel(
                    id=f"v{idx}",
                    resolution=c.resolution,
                    provider=c.provider,
                    bitrate_kbps=None,
                    kind="hls" if resolved.kind == "hls" else "file",
                )
            )

        return manifest_url, variants
