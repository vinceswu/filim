from __future__ import annotations

import asyncio
import hashlib
import time
from collections import Counter
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.service import CatalogService
from app.models import ProfileListEntry, Show, WatchProgress
from app.sources import ShowSummaryModel

# Module-level genre cache — recomputed every 5 min across all requests in worker.
_genres_cache: tuple[list[str], float] | None = None
_GENRES_TTL = 300


class RecommendationSectionModel(BaseModel):
    id: str
    title: str
    items: list[ShowSummaryModel]


def _seeded_shuffle(items: list, seed: str) -> list:
    """Deterministic Fisher-Yates shuffle using a string seed (LCG PRNG)."""
    items = list(items)
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    for i in range(len(items) - 1, 0, -1):
        h = (h * 1664525 + 1013904223) & 0xFFFFFFFF
        j = h % (i + 1)
        items[i], items[j] = items[j], items[i]
    return items


class RecommendationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.catalog = CatalogService(db=db)

    async def _genre_shows_from_db(
        self, genre: str, limit: int, exclude_ids: set[str]
    ) -> list[ShowSummaryModel]:
        import json as _json
        from sqlalchemy import text

        try:
            fetch_limit = limit + len(exclude_ids) + 20
            result = await self.db.execute(
                text("""
                    SELECT source_id, title, english_title, synopsis, genres,
                           episode_count, poster_url, cover_image_url
                    FROM shows
                    WHERE genres IS NOT NULL
                      AND EXISTS (
                        SELECT 1 FROM json_each(genres)
                        WHERE LOWER(value) = LOWER(:genre)
                      )
                    ORDER BY title
                    LIMIT :limit
                """),
                {"genre": genre, "limit": fetch_limit},
            )
            rows = result.mappings().all()
            out: list[ShowSummaryModel] = []
            for row in rows:
                if row["source_id"] in exclude_ids:
                    continue
                # Raw SQL bypasses SQLAlchemy JSON type processing — deserialize manually.
                raw_genres = row["genres"]
                if isinstance(raw_genres, str):
                    try:
                        genres = _json.loads(raw_genres)
                    except Exception:
                        genres = []
                elif isinstance(raw_genres, list):
                    genres = raw_genres
                else:
                    genres = []
                out.append(
                    ShowSummaryModel(
                        id=row["source_id"],
                        title=row["title"],
                        english_title=row["english_title"],
                        episode_count=row["episode_count"] or 0,
                        synopsis=row["synopsis"],
                        tags=genres,
                        poster_image_url=row["poster_url"],
                        banner_image_url=row["cover_image_url"],
                    )
                )
                if len(out) >= limit:
                    break
            return out
        except Exception:
            return []

    async def _shows_from_rows(self, rows: list[Show]) -> list[ShowSummaryModel]:
        return [
            ShowSummaryModel(
                id=row.source_id,
                title=row.title,
                episode_count=row.episode_count or 0,
                synopsis=row.synopsis,
                tags=row.genres or [],
                poster_image_url=row.poster_url,
                banner_image_url=row.cover_image_url,
            )
            for row in rows
        ]

    async def get_trending_section(self) -> RecommendationSectionModel:
        try:
            from sqlalchemy import func, text

            trending_ids = (
                select(
                    WatchProgress.show_id,
                    func.count(func.distinct(WatchProgress.device_id)).label("device_count"),
                )
                .where(
                    WatchProgress.last_updated
                    >= func.datetime("now", f"-30 days")
                )
                .group_by(WatchProgress.show_id)
                .order_by(text("device_count DESC"))
                .limit(30)
            ).subquery()

            stmt = (
                select(Show)
                .join(trending_ids, Show.source_id == trending_ids.c.show_id)
            )
            rows = (await self.db.execute(stmt)).scalars().all()
        except Exception:
            rows = []

        items = await self._shows_from_rows(rows)
        if len(items) < 10:
            popular = await self.catalog.source.get_popular_shows(limit=30)
            items = items + [
                p
                for p in popular
                if not any(existing.id == p.id for existing in items)
            ]

        return RecommendationSectionModel(
            id="trending", title="Trending now", items=items
        )

    async def get_my_list_section(
        self, profile_id: str
    ) -> RecommendationSectionModel | None:
        stmt = select(ProfileListEntry).where(ProfileListEntry.profile_id == profile_id)
        try:
            entries = (await self.db.execute(stmt)).scalars().all()
        except Exception:
            entries = []

        if not entries:
            return None

        show_ids = [e.show_id for e in entries]

        stmt = select(Show).where(Show.source_id.in_(show_ids))
        try:
            db_rows = (await self.db.execute(stmt)).scalars().all()
        except Exception:
            db_rows = []

        db_map = {row.source_id: row for row in db_rows}

        items: list[ShowSummaryModel] = []
        for sid in show_ids:
            if sid in db_map:
                row = db_map[sid]
                items.append(
                    ShowSummaryModel(
                        id=row.source_id,
                        title=row.title,
                        episode_count=row.episode_count or 0,
                        synopsis=row.synopsis,
                        tags=row.genres or [],
                        poster_image_url=row.poster_url,
                        banner_image_url=row.cover_image_url,
                    )
                )
            else:
                try:
                    details = await self.catalog.get_show_details(show_id=sid)
                    items.append(details)
                except Exception:
                    continue

        if not items:
            return None

        return RecommendationSectionModel(id="my_list", title="My List", items=items)

    async def _profile_genre_counts(self, profile_id: str) -> Counter[str]:
        """Genre counts derived from this profile's watch history."""
        try:
            stmt = (
                select(WatchProgress.show_id)
                .where(WatchProgress.profile_id == profile_id)
                .distinct()
            )
            result = await self.db.execute(stmt)
            watched_ids = [row[0] for row in result.all()]
        except Exception:
            return Counter()

        if not watched_ids:
            return Counter()

        try:
            stmt = select(Show.genres).where(Show.source_id.in_(watched_ids))
            result = await self.db.execute(stmt)
            counts: Counter[str] = Counter()
            for row in result.scalars().all():
                if row:
                    counts.update([g.strip().title() for g in row if g.strip()])
            return counts
        except Exception:
            return Counter()

    async def _global_genre_counts(self) -> Counter[str]:
        counts: Counter[str] = Counter()
        try:
            result = await self.db.execute(select(Show.genres))
            for row in result.scalars().all():
                if row:
                    counts.update([g.strip().title() for g in row if g.strip()])
        except Exception:
            pass
        return counts

    async def get_for_you_section(
        self, profile_id: str | None = None
    ) -> RecommendationSectionModel:
        # Prefer profile watch-history genres; fall back to global distribution.
        genre_counts: Counter[str] = Counter()
        if profile_id:
            genre_counts = await self._profile_genre_counts(profile_id)
        if not genre_counts:
            genre_counts = await self._global_genre_counts()

        if genre_counts:
            top_genre = genre_counts.most_common(1)[0][0]
            filtered = await self.catalog.search(query="", genres=[top_genre], page=1)
            if len(filtered) >= 5:
                return RecommendationSectionModel(
                    id="for_you",
                    title="Recommended for you",
                    items=filtered[:20],
                )

        popular = await self.catalog.source.get_popular_shows(limit=50)
        offset_items = popular[10:30] if len(popular) > 10 else popular
        return RecommendationSectionModel(
            id="for_you",
            title="Recommended for you",
            items=offset_items,
        )

    async def _fetch_raw_genres(self) -> list[str]:
        from sqlalchemy import text

        try:
            result = await self.db.execute(
                text("""
                    SELECT value AS genre, COUNT(DISTINCT source_id) AS cnt
                    FROM shows, json_each(genres)
                    WHERE genres IS NOT NULL
                    GROUP BY LOWER(value)
                    HAVING COUNT(DISTINCT source_id) >= 4
                    ORDER BY cnt DESC
                """)
            )
            return [row[0].strip().title() for row in result.all() if row[0].strip()]
        except Exception:
            return []

    async def _get_dynamic_genres(
        self, exclude: list[str] | None = None, profile_id: str | None = None
    ) -> list[str]:
        global _genres_cache
        now = time.monotonic()

        if _genres_cache is None or now > _genres_cache[1]:
            genres = await self._fetch_raw_genres()
            _genres_cache = (genres, now + _GENRES_TTL)
        else:
            genres = _genres_cache[0]

        exclude_set = {g.strip().title() for g in (exclude or [])}
        return [g for g in genres if g not in exclude_set]

    async def get_discovery_sections(
        self,
        cursor: int = 0,
        limit: int = 3,
        profile_id: str | None = None,
    ) -> tuple[list[RecommendationSectionModel], int | None]:
        exclude_genres: list[str] = []
        try:
            for_you = await self.get_for_you_section(profile_id=profile_id)
            if "Recommended for " in for_you.title:
                genre_counts = await self._global_genre_counts()
                if genre_counts:
                    exclude_genres.append(genre_counts.most_common(1)[0][0])
        except Exception:
            pass

        genres = await self._get_dynamic_genres(
            exclude=exclude_genres, profile_id=profile_id
        )

        if not genres:
            return [], None

        total = len(genres)
        lap, pos = divmod(cursor, total)

        # Reshuffle each lap so repeated cycles have different ordering.
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        lap_seed = f"{profile_id or 'guest'}:{today}:lap{lap}"
        genres = _seeded_shuffle(genres, lap_seed)

        # Buffer: try up to limit*3 genres to fill limit sections (dedup may reduce items).
        batch_size = min(limit * 3, total - pos)
        batch = genres[pos : pos + batch_size]

        sections: list[RecommendationSectionModel] = []
        seen_ids: set[str] = set()
        genres_iterated = 0

        for genre in batch:
            if len(sections) >= limit:
                break
            genres_iterated += 1

            final_items = await self._genre_shows_from_db(genre, 20, seen_ids)
            for item in final_items:
                seen_ids.add(item.id)

            if len(final_items) >= 4:
                slug = genre.lower().replace(" ", "_")
                sections.append(
                    RecommendationSectionModel(
                        id=f"genre_{slug}_lap{lap}",
                        title=genre,
                        items=final_items,
                    )
                )

        next_pos = cursor + genres_iterated
        next_cursor: int | None = None if next_pos >= total else next_pos
        return sections, next_cursor

    async def get_device_recommendations(
        self,
        device_token: str,
        profile_id: str | None = None,
    ) -> list[RecommendationSectionModel]:
        is_guest = False

        if profile_id:
            from app.models.profiles import Profile

            profile = await self.db.get(Profile, profile_id)
            if profile and profile.is_guest:
                is_guest = True

        coros = []
        if not is_guest:
            coros.append(self.get_for_you_section(profile_id=profile_id))
        coros.append(self.get_trending_section())
        if profile_id and not is_guest:
            coros.append(self.get_my_list_section(profile_id=profile_id))

        results = await asyncio.gather(*coros, return_exceptions=True)

        sections: list[RecommendationSectionModel] = []
        seen_ids: set[str] = set()
        for r in results:
            if isinstance(r, Exception) or r is None:
                continue
            deduped = [item for item in r.items if item.id not in seen_ids]
            seen_ids.update(item.id for item in deduped)
            if deduped:
                sections.append(RecommendationSectionModel(
                    id=r.id, title=r.title, items=deduped
                ))

        return sections

    async def get_global_recommendations(self) -> list[RecommendationSectionModel]:
        trending = await self.get_trending_section()
        return [trending]
