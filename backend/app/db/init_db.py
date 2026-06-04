from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.utils import normalize_genre_list
from app.db.session import engine
from app.models import AppSettings, Base, Profile

logger = logging.getLogger(__name__)


def _column_names(connection: Connection, table: str) -> set[str]:
    insp = inspect(connection)
    try:
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return set()


def _apply_sqlite_debrand_migrations(connection: Connection) -> None:
    """Upgrade pre-debrand SQLite schemas (anime* -> show*) before create_all."""
    insp = inspect(connection)
    tables = set(insp.get_table_names())

    if "anime" in tables and "shows" not in tables:
        connection.execute(text("ALTER TABLE anime RENAME TO shows"))
        logger.info("Renamed table anime -> shows")
        insp = inspect(connection)
        tables = set(insp.get_table_names())

    if "anime_stats" in tables:
        connection.execute(text("ALTER TABLE anime_stats RENAME TO show_stats"))
        logger.info("Renamed table anime_stats -> show_stats")
        insp = inspect(connection)
        tables = set(insp.get_table_names())

    if "episodes" in tables and "anime_id" in _column_names(connection, "episodes"):
        connection.execute(
            text("ALTER TABLE episodes RENAME COLUMN anime_id TO show_id")
        )
        logger.info("Renamed episodes.anime_id -> show_id")

    if "show_stats" in tables and "anime_id" in _column_names(connection, "show_stats"):
        connection.execute(
            text("ALTER TABLE show_stats RENAME COLUMN anime_id TO show_id")
        )
        logger.info("Renamed show_stats.anime_id -> show_id")

    if "profile_list_entries" in tables and "anime_id" in _column_names(
        connection, "profile_list_entries"
    ):
        connection.execute(
            text("ALTER TABLE profile_list_entries RENAME COLUMN anime_id TO show_id")
        )
        logger.info("Renamed profile_list_entries.anime_id -> show_id")

    if "profile_ratings" in tables and "anime_id" in _column_names(
        connection, "profile_ratings"
    ):
        connection.execute(
            text("ALTER TABLE profile_ratings RENAME COLUMN anime_id TO show_id")
        )
        logger.info("Renamed profile_ratings.anime_id -> show_id")

    if "watch_progress" in tables and "anime_id" in _column_names(
        connection, "watch_progress"
    ):
        connection.execute(
            text("ALTER TABLE watch_progress RENAME COLUMN anime_id TO show_id")
        )
        logger.info("Renamed watch_progress.anime_id -> show_id")

    if "shows" in tables and "allanime_raw" in _column_names(connection, "shows"):
        connection.execute(
            text("ALTER TABLE shows RENAME COLUMN allanime_raw TO provider_raw")
        )
        logger.info("Renamed shows.allanime_raw -> provider_raw")

    if "episodes" in tables and "allanime_raw" in _column_names(connection, "episodes"):
        connection.execute(
            text("ALTER TABLE episodes RENAME COLUMN allanime_raw TO provider_raw")
        )
        logger.info("Renamed episodes.allanime_raw -> provider_raw")


def _backfill_show_genres(connection: Connection) -> None:
    if "shows" not in set(inspect(connection).get_table_names()):
        return

    result = connection.execute(text("SELECT id, genres FROM shows"))
    rows = result.fetchall()
    for row in rows:
        pk, raw_genres = row[0], row[1]
        if raw_genres is None:
            continue
        parsed: Any
        if isinstance(raw_genres, str):
            try:
                parsed = json.loads(raw_genres)
            except json.JSONDecodeError:
                continue
        else:
            parsed = raw_genres
        if not isinstance(parsed, list):
            continue
        str_list = [str(x) for x in parsed if x is not None]
        normalized = normalize_genre_list(str_list)
        if normalized == str_list:
            continue
        connection.execute(
            text("UPDATE shows SET genres = :g WHERE id = :id"),
            {"g": json.dumps(normalized), "id": pk},
        )
        logger.debug("Normalized genres for show %s", pk)


def _migrate_schema_sync(connection: Connection) -> None:
    _apply_sqlite_debrand_migrations(connection)
    _backfill_show_genres(connection)


async def _init_db(db_engine: AsyncEngine) -> None:
    async with db_engine.begin() as conn:
        await conn.run_sync(_migrate_schema_sync)
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as db:
        # ── Column migrations (all before any ORM queries) ──────────────────
        _column_migrations = [
            (
                "profiles",
                "ALTER TABLE profiles ADD COLUMN is_guest BOOLEAN DEFAULT 0 NOT NULL",
            ),
            (
                "profiles",
                "ALTER TABLE profiles ADD COLUMN max_concurrent_streams INTEGER",
            ),
            (
                "app_settings",
                "ALTER TABLE app_settings ADD COLUMN require_profile_pins BOOLEAN DEFAULT 0 NOT NULL",
            ),
            (
                "app_settings",
                "ALTER TABLE app_settings ADD COLUMN max_concurrent_streams INTEGER",
            ),
        ]
        for table, sql in _column_migrations:
            try:
                await db.execute(text(sql))
                await db.commit()
            except Exception:
                await db.rollback()

        # ── Seed data ───────────────────────────────────────────────────────
        stmt = select(Profile).where(Profile.is_guest.is_(True))
        result = await db.execute(stmt)
        guest = result.scalar_one_or_none()

        if guest is None:
            from uuid import uuid4

            guest_profile = Profile(
                id=str(uuid4()), name="Guest", is_guest=True, is_locked=False
            )
            db.add(guest_profile)
            await db.commit()

        # Initialize AppSettings singleton
        import secrets

        app_settings = await db.get(AppSettings, "singleton")
        if app_settings is None:
            import hashlib

            default_password = secrets.token_urlsafe(12)
            default_hash = hashlib.sha256(default_password.encode()).hexdigest()
            app_settings = AppSettings(
                id="singleton",
                admin_password_hash=default_hash,
                allow_creating_profiles=True,
                guest_profile_enabled=True,
                require_profile_pins=False,
            )
            db.add(app_settings)
            await db.commit()
            logger.info("Admin initialized with password: %s", default_password)


def main() -> None:
    asyncio.run(_init_db(engine))


if __name__ == "__main__":
    main()
