"""Two-tier persistent cache: in-memory L1 + SQLite L2.

Entries have a TTL (default 10 years, effectively permanent).  Each entry
carries a separate `stale_at` timestamp (default 7 days from write).
Staleness is used by the cache_response decorator to trigger a background
re-fetch while serving the cached value immediately (stale-while-revalidate).

L1 tuple layout: (value: str, expires_at: float, stale_at: float)
  - expires_at controls when the entry is eligible for eviction.
  - stale_at controls when background re-fetch is triggered.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Dict, Optional, Tuple

import aiosqlite

logger = logging.getLogger(__name__)

_DEFAULT_STALE_SECONDS = 604800  # 7 days


def _db_path() -> str:
    from app.core.config import settings

    return os.path.join(settings.project_root, "cache.db")


class PersistentCache:
    """Two-tier cache backed by SQLite.  Entries never expire; staleness
    triggers background revalidation rather than eviction."""

    def __init__(self) -> None:
        self._l1: Dict[str, Tuple[str, float, float]] = {}  # value, expires_at, stale_at
        self._db: Optional[aiosqlite.Connection] = None
        self._initialized: bool = False
        self._init_lock: Optional[asyncio.Lock] = None
        self._cleanup_task: Optional[asyncio.Task] = None

    async def _ensure_init(self) -> None:
        if self._initialized:
            return
        if self._init_lock is None:
            self._init_lock = asyncio.Lock()
        async with self._init_lock:
            if self._initialized:
                return
            await self._bootstrap()
            self._initialized = True

    async def _get_db(self) -> aiosqlite.Connection:
        if self._db is None:
            self._db = await aiosqlite.connect(_db_path(), timeout=30)
        return self._db

    async def _bootstrap(self) -> None:
        db = await self._get_db()
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=NORMAL")
        await db.execute("PRAGMA busy_timeout=5000")
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS cache (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                expires_at REAL NOT NULL,
                stale_at   REAL NOT NULL DEFAULT 0
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_exp ON cache(expires_at)"
        )
        await db.commit()

        # Migrate existing rows that lack stale_at column — must happen before
        # creating the index on stale_at so the column exists first.
        try:
            await db.execute(
                "ALTER TABLE cache ADD COLUMN stale_at REAL NOT NULL DEFAULT 0"
            )
            await db.commit()
        except Exception:
            pass  # Column already exists.

        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_stale ON cache(stale_at)"
        )
        await db.commit()

        cursor = await db.execute(
            "SELECT key, value, expires_at, stale_at FROM cache WHERE expires_at > ?",
            (now,),
        )
        rows = await cursor.fetchall()
        for key, value, exp, stale_at in rows:
            self._l1[key] = (value, exp, stale_at)
        logger.info("Cache: loaded %d entries from disk", len(rows))

    async def get(self, key: str) -> Optional[str]:
        await self._ensure_init()
        now = time.time()

        entry = self._l1.get(key)
        if entry is not None:
            value, exp, _ = entry
            if exp > now:
                return value
            del self._l1[key]
            return None

        try:
            db = await self._get_db()
            cursor = await db.execute(
                "SELECT value, expires_at, stale_at FROM cache WHERE key = ?", (key,)
            )
            row = await cursor.fetchone()
            if row and row[1] > now:
                self._l1[key] = (row[0], row[1], row[2])
                return row[0]
        except Exception:
            logger.exception("Cache L2 read error for key: %s", key)

        return None

    async def is_stale(self, key: str) -> bool:
        """Return True if the entry exists but its stale_at has passed."""
        await self._ensure_init()
        now = time.time()

        entry = self._l1.get(key)
        if entry is not None:
            _, exp, stale_at = entry
            return exp > now and stale_at <= now

        try:
            db = await self._get_db()
            cursor = await db.execute(
                "SELECT stale_at FROM cache WHERE key = ? AND expires_at > ?",
                (key, now),
            )
            row = await cursor.fetchone()
            if row:
                return row[0] <= now
        except Exception:
            logger.exception("Cache stale check error for key: %s", key)

        return False

    async def setex(
        self,
        key: str,
        seconds: int,
        value: str,
        stale_seconds: int = _DEFAULT_STALE_SECONDS,
    ) -> bool:
        """Store value with TTL; stale_seconds controls when revalidation fires."""
        await self._ensure_init()
        now = time.time()
        expires_at = now + seconds
        stale_at = now + stale_seconds

        self._l1[key] = (value, expires_at, stale_at)

        try:
            db = await self._get_db()
            await db.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at, stale_at) "
                "VALUES (?, ?, ?, ?)",
                (key, value, expires_at, stale_at),
            )
            await db.commit()
        except Exception:
            logger.exception("Cache L2 write error for key: %s", key)

        return True

    async def start_cleanup(self, interval: int = 300) -> None:
        """Periodic pruning of expired entries."""
        await self._ensure_init()
        if self._cleanup_task is not None:
            return

        async def _loop() -> None:
            jitter = (os.getpid() % 60) * 5
            await asyncio.sleep(jitter)
            while True:
                try:
                    await asyncio.sleep(interval)
                    await self._prune()
                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Cache cleanup tick failed")

        self._cleanup_task = asyncio.create_task(_loop())

    async def stop_cleanup(self) -> None:
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        if self._db is not None:
            try:
                await self._db.close()
            except Exception:
                logger.exception("Cache DB close error")
            self._db = None

    async def _prune(self) -> None:
        now = time.time()
        expired = [
            k for k, (_, exp, _s) in self._l1.items()
            if exp <= now
        ]
        for k in expired:
            del self._l1[k]

        try:
            db = await self._get_db()
            await db.execute(
                "DELETE FROM cache WHERE expires_at <= ?",
                (now,),
            )
            await db.commit()
        except Exception:
            logger.exception("Cache L2 prune error")

    async def delete(self, key: str) -> None:
        await self._ensure_init()
        self._l1.pop(key, None)
        try:
            db = await self._get_db()
            await db.execute("DELETE FROM cache WHERE key = ?", (key,))
            await db.commit()
        except Exception:
            logger.exception("Cache L2 delete error for key: %s", key)

    async def clear(self) -> None:
        self._l1.clear()
        try:
            db = await self._get_db()
            await db.execute("DELETE FROM cache")
            await db.commit()
        except Exception:
            logger.exception("Cache clear error")


cache_client = PersistentCache()
