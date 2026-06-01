"""One-shot cache warm-up on worker startup.

Delegates to the same refresh functions used by the periodic background loops
so first-user requests hit L1 cache instead of FlareSolverr.
Failures are swallowed — warmup is best-effort and must never crash the app.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_TOP_GENRES = [
    "Action",
    "Adventure",
    "Comedy",
    "Fantasy",
    "Romance",
    "Drama",
    "Supernatural",
    "Sci-Fi",
    "Thriller",
    "Slice of Life",
]

_STAGGER_SECONDS = 1.2


async def warm_catalog_cache() -> None:
    from app.core.catalog_refresh import refresh_popular
    from app.db.session import AsyncSessionLocal
    from app.sources import get_catalog_adapter

    adapter = get_catalog_adapter()

    try:
        count = await refresh_popular(adapter, db_factory=AsyncSessionLocal)
        logger.info("Warmup: %d popular shows cached + upserted", count)
    except Exception as exc:
        logger.warning("Warmup: popular fetch failed: %s", exc)

    for genre in _TOP_GENRES:
        try:
            await adapter.search_shows(query="", genres=[genre], page=1)
            logger.info("Warmup: genre '%s' cached", genre)
        except Exception as exc:
            logger.warning("Warmup: genre '%s' failed: %s", genre, exc)
        await asyncio.sleep(_STAGGER_SECONDS)

    logger.info("Warmup complete")


async def run_warmup() -> None:
    await asyncio.sleep(2)
    await warm_catalog_cache()
