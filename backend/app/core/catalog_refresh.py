"""Periodic catalog refresh — two background loops running for worker lifetime.

  popular_loop  — every 2 h: re-fetches popular shows (sub/dub/movie, 3 pages each)
  full_loop     — every 6 h: sweeps all COMMON_GENRES (2 pages each) + popular

Both upsert every discovered show to the DB so genre carousels can be served
from DB without hitting upstream.  Requests are staggered to avoid hammering
FlareSolverr.  Transient failures use exponential backoff (max 30 min).
"""

from __future__ import annotations

import asyncio
import logging

from app.core.constants import COMMON_GENRES

logger = logging.getLogger(__name__)

_POPULAR_INTERVAL = 7200    # 2 h
_FULL_INTERVAL = 21600      # 6 h
_STAGGER = 1.2              # seconds between upstream requests
_MAX_BACKOFF = 1800         # 30 min


async def _upsert_batch(shows, db_factory) -> int:
    if not shows or db_factory is None:
        return 0
    from app.catalog.service import CatalogService

    async with db_factory() as db:
        svc = CatalogService(db=db)
        for show in shows:
            await svc._upsert_show_from_summary(show)
    return len(shows)


async def refresh_popular(adapter, db_factory) -> int:
    """Fetch 3 pages of popular shows for sub/dub/movie, upsert to DB."""
    total = 0
    targets = [
        {"mode": "sub"},
        {"mode": "dub"},
        {"mode": "sub", "show_type": "Movie"},
    ]
    for kwargs in targets:
        for page in range(1, 4):
            try:
                results = await adapter.get_popular_shows(limit=40, page=page, **kwargs)
                total += await _upsert_batch(results, db_factory)
            except Exception as exc:
                logger.warning("Popular refresh (%s page=%d): %s", kwargs, page, exc)
            await asyncio.sleep(_STAGGER)
    return total


async def refresh_genres(adapter, db_factory) -> int:
    """Fetch 2 pages per genre for all COMMON_GENRES, upsert to DB."""
    total = 0
    for genre in COMMON_GENRES:
        for page in range(1, 3):
            try:
                results = await adapter.search_shows(query="", genres=[genre], page=page)
                total += await _upsert_batch(results, db_factory)
            except Exception as exc:
                logger.warning("Genre refresh (%s page=%d): %s", genre, page, exc)
            await asyncio.sleep(_STAGGER)
    return total


async def _loop(name: str, interval: int, fn) -> None:
    backoff = 60
    while True:
        try:
            await asyncio.sleep(interval)
            count = await fn()
            logger.info("%s: %d shows processed", name, count)
            backoff = 60
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("%s error — retrying in %ds: %s", name, backoff, exc)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, _MAX_BACKOFF)


async def run_catalog_refresh(db_factory) -> None:
    """Launch popular + full refresh loops concurrently.  Runs until cancelled."""
    from app.sources import get_catalog_adapter

    adapter = get_catalog_adapter()

    await asyncio.gather(
        _loop("Popular refresh", _POPULAR_INTERVAL, lambda: refresh_popular(adapter, db_factory)),
        _loop("Full refresh", _FULL_INTERVAL, lambda: refresh_genres(adapter, db_factory)),
    )
