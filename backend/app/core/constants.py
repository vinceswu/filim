from __future__ import annotations

# Relationship Types
REL_SEQUEL = "sequel"
REL_PREQUEL = "prequel"
REL_SIDE_STORY = "side_story"
REL_PARENT_STORY = "parent_story"
REL_ALTERNATIVE_SETTING = "alternative_setting"

SUPPORTED_RELATIONS = {
    REL_SEQUEL,
    REL_PREQUEL,
    REL_SIDE_STORY,
    REL_PARENT_STORY,
    REL_ALTERNATIVE_SETTING,
}

# Upstream may tag franchise-adjacent links as "other"; include for discovery, not season lineup.
REL_OTHER = "other"
RELATIONS_FOR_SIMILAR = SUPPORTED_RELATIONS | {REL_OTHER}

# Translation Modes
MODE_SUB = "sub"
MODE_DUB = "dub"

# Default HTTP Settings
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

# Source Configuration
ALLANIME_API_URL = "https://api.allanime.day/api"
ALLANIME_BASE_URL = "https://allanime.day"
ALLANIME_REFERER = "https://allanime.day"
HTTP_TIMEOUT_SECONDS = 15.0

# Application Configuration
TRENDING_WINDOW_DAYS = 30
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
DEFAULT_LOG_LEVEL = "INFO"

# Common Genres for Search Optimization
COMMON_GENRES = {
    "Action",
    "Adventure",
    "Comedy",
    "Drama",
    "Fantasy",
    "Horror",
    "Mystery",
    "Psychological",
    "Romance",
    "Sci-Fi",
    "Slice of Life",
    "Sports",
    "Supernatural",
    "Thriller",
    "Mecha",
    "Music",
    "Isekai",
    "Seinen",
    "Shounen",
    "Shoujo",
    "Josei",
    "Historical",
    "Martial Arts",
    "Demons",
    "Magic",
    "Military",
    "Super Power",
    "Space",
    "Vampire",
    "Parody",
    "Police",
    "Samurai",
}


def genres_for_upstream_api(genres: list[str]) -> list[str]:
    """Map short UI genre names to upstream catalog search filter labels."""
    out: list[str] = []
    for g in genres:
        t = g.strip()
        if t in COMMON_GENRES:
            out.append(f"{t} Anime")
        else:
            out.append(t)
    return out
