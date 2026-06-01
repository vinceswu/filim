from __future__ import annotations

import asyncio
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import (
    MODE_SUB,
    RELATIONS_FOR_SIMILAR,
    SUPPORTED_RELATIONS,
)
from app.core.utils import normalize_title
from app.models import Show, WatchProgress
from app.sources import AllanimeCatalogAdapter, EpisodeSummaryModel, ShowSummaryModel, get_catalog_adapter


def _franchise_search_query(title: str | None, english_title: str | None) -> str | None:
    raw = (english_title or title or "").strip()
    if len(raw) < 4:
        return None
    stop = frozenset(
        {
            "the",
            "a",
            "an",
            "tv",
            "ova",
            "movie",
            "special",
            "specials",
            "season",
            "part",
            "cour",
            "oav",
        }
    )
    parts = [p for p in re.split(r"[\s:\-–—]+", raw) if p and p.lower() not in stop]
    if len(parts) < 2:
        return None
    q = " ".join(parts[:2])
    return q if len(q.strip()) >= 4 else None


class CatalogService:
    """Catalog facade combining local cache and upstream GraphQL adapter."""

    def __init__(self, db: AsyncSession, source: AllanimeCatalogAdapter | None = None):
        self.db = db
        self.source = source or get_catalog_adapter()

    async def _db_genre_exists(self, genre: str) -> bool:
        from sqlalchemy import text
        result = await self.db.execute(
            text("""
                SELECT 1 FROM shows, json_each(genres)
                WHERE genres IS NOT NULL AND LOWER(value) = LOWER(:genre)
                LIMIT 1
            """),
            {"genre": genre},
        )
        return result.first() is not None

    async def _search_db_by_genre(
        self, genre: str, page: int = 1, limit: int = 40
    ) -> list[ShowSummaryModel]:
        import json as _json
        from sqlalchemy import text
        offset = (page - 1) * limit
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
                LIMIT :limit OFFSET :offset
            """),
            {"genre": genre, "limit": limit, "offset": offset},
        )
        rows = result.mappings().all()
        out: list[ShowSummaryModel] = []
        for row in rows:
            raw = row["genres"]
            if isinstance(raw, str):
                try:
                    tags = _json.loads(raw)
                except Exception:
                    tags = []
            elif isinstance(raw, list):
                tags = raw
            else:
                tags = []
            out.append(ShowSummaryModel(
                id=row["source_id"],
                title=row["title"],
                english_title=row["english_title"],
                episode_count=row["episode_count"] or 0,
                synopsis=row["synopsis"],
                tags=tags,
                poster_image_url=row["poster_url"],
                banner_image_url=row["cover_image_url"],
            ))
        return out

    async def search(
        self,
        query: str,
        mode: str = MODE_SUB,
        page: int = 1,
        genres: list[str] | None = None,
    ) -> list[ShowSummaryModel]:
        # Explicit genre filter — search DB directly.
        if genres:
            for genre in genres:
                db_results = await self._search_db_by_genre(genre, page=page)
                if db_results:
                    return self._deduplicate_results(db_results)

        # Check if the query itself is a known genre in DB.
        q_clean = query.strip()
        if q_clean and await self._db_genre_exists(q_clean):
            db_results = await self._search_db_by_genre(q_clean, page=page)
            if db_results:
                return self._deduplicate_results(db_results)

        results = await self.source.search_shows(
            query=q_clean, mode=mode, page=page, genres=None
        )
        return self._deduplicate_results(results)

    def _deduplicate_results(
        self, results: list[ShowSummaryModel]
    ) -> list[ShowSummaryModel]:
        if not results:
            return []

        merged: dict[str, ShowSummaryModel] = {}
        seen_ids: set[str] = set()

        for item in results:
            if item.id and item.id in seen_ids:
                continue

            title = item.english_title or item.title
            clean_title = normalize_title(title)

            if clean_title not in merged:
                merged[clean_title] = item
                if item.id:
                    seen_ids.add(item.id)
            else:
                existing = merged[clean_title]
                if (item.episode_count or 0) > (existing.episode_count or 0):
                    merged[clean_title] = item

        return list(merged.values())

    async def _upsert_show_from_summary(self, summary: ShowSummaryModel) -> None:
        """Persist or update a minimal Show row for downstream features."""

        if not summary.id:
            return

        result = await self.db.execute(select(Show).where(Show.source_id == summary.id))
        row = result.scalar_one_or_none()

        if row is None:
            row = Show(
                source_id=summary.id,
                title=summary.title or "",
                english_title=summary.english_title,
                alt_names=summary.alt_names,
                synopsis=summary.synopsis,
                genres=summary.tags or None,
                episode_count=summary.episode_count or None,
                poster_url=summary.poster_image_url,
                cover_image_url=summary.banner_image_url,
            )
            self.db.add(row)
        else:
            if summary.title:
                row.title = summary.title
            if summary.english_title:
                row.english_title = summary.english_title
            if summary.alt_names:
                row.alt_names = summary.alt_names
            if summary.synopsis:
                row.synopsis = summary.synopsis
            if summary.tags:
                row.genres = summary.tags
            if summary.episode_count:
                row.episode_count = summary.episode_count
            if summary.poster_image_url:
                row.poster_url = summary.poster_image_url
            if summary.banner_image_url:
                row.cover_image_url = summary.banner_image_url

        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()

    async def get_show_details(
        self,
        show_id: str,
        mode: str = MODE_SUB,
        search_query: str | None = None,
    ) -> ShowSummaryModel:
        """Return show metadata, with fallbacks for IDs that only resolve via search."""

        # DB-first: if we have complete data locally, skip upstream entirely.
        db_result = await self.db.execute(select(Show).where(Show.source_id == show_id))
        db_row = db_result.scalar_one_or_none()
        if db_row and db_row.title and db_row.episode_count:
            return ShowSummaryModel(
                id=db_row.source_id,
                title=db_row.title,
                english_title=db_row.english_title,
                episode_count=db_row.episode_count or 0,
                synopsis=db_row.synopsis,
                tags=db_row.genres or [],
                poster_image_url=db_row.poster_url,
                banner_image_url=db_row.cover_image_url,
            )

        details = await self.source.get_show_details(show_id=show_id, mode=mode)

        summary: ShowSummaryModel = details
        if not (details.title or details.episode_count):
            if search_query:
                search_results = await self.source.search_shows(
                    query=search_query, mode=mode
                )
                for item in search_results:
                    if item.id == show_id:
                        summary = item
                        break
                else:
                    summary = details
            else:
                popular = await self.source.get_popular_shows(limit=400, mode=mode)
                for item in popular:
                    if item.id == show_id:
                        summary = item
                        break
                else:
                    summary = details

        await self._upsert_show_from_summary(summary)
        return summary

    async def get_episode_list(
        self,
        show_id: str,
        mode: str = MODE_SUB,
        search_query: str | None = None,
    ) -> list[EpisodeSummaryModel]:
        episodes = await self.source.get_episode_list(show_id=show_id, mode=mode)

        if episodes:
            return episodes

        details = await self.get_show_details(
            show_id=show_id,
            mode=mode,
            search_query=search_query,
        )
        if details.episode_count > 0:
            return [
                EpisodeSummaryModel(number=str(i))
                for i in range(1, details.episode_count + 1)
            ]

        return episodes

    async def get_trending(
        self, limit: int = 20, page: int = 1
    ) -> list[ShowSummaryModel]:
        """Return trending shows based on watch progress data, with fallback to source popular."""

        try:
            from sqlalchemy import func, text

            trending_ids = (
                select(
                    WatchProgress.show_id,
                    func.count(func.distinct(WatchProgress.device_id)).label("device_count"),
                    func.coalesce(func.sum(WatchProgress.duration_seconds), 0).label("watch_time"),
                )
                .where(
                    WatchProgress.last_updated
                    >= func.datetime("now", f"-{settings.trending_window_days} days")
                )
                .group_by(WatchProgress.show_id)
                .order_by(text("device_count DESC, watch_time DESC"))
                .limit(limit)
                .offset((page - 1) * limit)
            ).subquery()

            stmt = (
                select(Show)
                .join(trending_ids, Show.source_id == trending_ids.c.show_id)
            )
            rows = (await self.db.execute(stmt)).scalars().all()
            if rows:
                return self._deduplicate_results([
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
                ])
        except Exception:
            pass

        popular = await self.source.get_popular_shows(limit=limit, page=page)
        return self._deduplicate_results(popular)

    async def get_shows(
        self, limit: int = 40, page: int = 1, mode: str = MODE_SUB
    ) -> list[ShowSummaryModel]:
        """Return popular TV shows (more than 1 episode)."""
        popular = await self.source.get_popular_shows(limit=limit, page=page, mode=mode)
        filtered = [s for s in popular if (s.episode_count or 0) > 1]
        return self._deduplicate_results(filtered)

    async def get_movies(
        self, limit: int = 40, page: int = 1, mode: str = MODE_SUB
    ) -> list[ShowSummaryModel]:
        """Return movies using upstream type=Movie filter with multi-page fallback."""
        # Try the API-level type filter first (single page, cheapest path).
        results = await self.source.get_popular_shows(
            limit=limit, page=page, mode=mode, show_type="Movie"
        )
        movies = [s for s in results if getattr(s, "type", None) == "Movie"]
        if movies:
            return self._deduplicate_results(movies)

        # API didn't return Movie-typed items (type filter not supported or no
        # movies on this page). Scan a window of 5 upstream pages offset by the
        # requested page so each frontend page gets different results.
        pages_per_window = 5
        start_page = (page - 1) * pages_per_window + 1
        end_page = start_page + pages_per_window
        page_results = await asyncio.gather(
            *[
                self.source.get_popular_shows(limit=40, page=p, mode=mode)
                for p in range(start_page, end_page)
            ],
            return_exceptions=True,
        )
        all_shows: list[ShowSummaryModel] = []
        for pr in page_results:
            if not isinstance(pr, Exception):
                all_shows.extend(pr)

        if not all_shows:
            # Upstream returned nothing for this window — no more pages.
            return []

        movies = [s for s in all_shows if getattr(s, "type", None) == "Movie"]
        if not movies:
            # Last resort: short-episode shows (OVA/specials/single-ep movies).
            movies = [s for s in all_shows if (s.episode_count or 0) <= 3]

        return self._deduplicate_results(movies[:limit])

    async def _summaries_from_related_edges(
        self,
        root: ShowSummaryModel,
        mode: str,
        allowed_relations: set[str],
    ) -> list[ShowSummaryModel]:
        out: list[ShowSummaryModel] = []
        if not root.related_shows:
            return out

        seen: set[str] = set()
        if root.id:
            seen.add(root.id)

        for rel in root.related_shows:
            rel_id = rel.get("showId")
            relation = (rel.get("relation") or "").lower()
            if relation not in allowed_relations or not rel_id or rel_id in seen:
                continue
            try:
                rel_show = await self.get_show_details(rel_id, mode=mode)
                out.append(rel_show)
                seen.add(rel_id)
            except Exception:
                continue
        return out

    async def get_series_lineup(
        self, show_id: str, mode: str = MODE_SUB
    ) -> list[ShowSummaryModel]:
        """Fetch related seasons/shows for a series lineup."""
        root = await self.get_show_details(show_id, mode=mode)
        related = await self._summaries_from_related_edges(
            root, mode, SUPPORTED_RELATIONS
        )
        if not related:
            return [root]
        return [root, *related]

    async def get_similar_shows(
        self,
        show_id: str,
        mode: str = MODE_SUB,
        limit: int = 12,
    ) -> list[ShowSummaryModel]:
        """Related entries first, then same-show genres, then a short franchise title search."""
        target = max(1, min(limit, 30))
        root = await self.get_show_details(show_id, mode=mode)
        related = await self._summaries_from_related_edges(
            root, mode, RELATIONS_FOR_SIMILAR
        )

        out: list[ShowSummaryModel] = []
        seen: set[str] = {show_id}
        for s in related:
            if s.id and s.id not in seen:
                out.append(s)
                seen.add(s.id)
            if len(out) >= target:
                return out

        tags = [t.strip() for t in (root.tags or []) if t and str(t).strip()]
        max_tag_rounds = min(len(tags), 12)
        for tag in tags[:max_tag_rounds]:
            if len(out) >= target:
                break
            for page in (1, 2):
                if len(out) >= target:
                    break
                try:
                    batch = await self.search(
                        query="", genres=[tag], mode=mode, page=page
                    )
                except Exception:
                    continue
                for item in batch:
                    if item.id and item.id not in seen:
                        out.append(item)
                        seen.add(item.id)
                    if len(out) >= target:
                        return out

        if len(out) < target and tags:
            for tag in tags[:max_tag_rounds]:
                if len(out) >= target:
                    break
                try:
                    batch = await self.search(query=tag, mode=mode, page=1)
                except Exception:
                    continue
                for item in batch:
                    if item.id and item.id not in seen:
                        out.append(item)
                        seen.add(item.id)
                    if len(out) >= target:
                        return out

        q = _franchise_search_query(root.title, root.english_title)
        if q and len(out) < target:
            try:
                batch = await self.search(query=q, mode=mode, page=1)
            except Exception:
                batch = []
            for item in batch:
                if item.id and item.id not in seen:
                    out.append(item)
                    seen.add(item.id)
                if len(out) >= target:
                    break

        return out[:target]
