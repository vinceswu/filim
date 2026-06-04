"""Stale-while-revalidate cache decorator.

On cache hit:
  - Serve cached value immediately.
  - If entry is stale (stale_at passed), fire a background re-fetch to refresh
    the cache for the next caller.  The current caller never waits.

On cache miss:
  - Fetch synchronously, store permanently with stale_seconds TTL.

_refreshing_keys prevents multiple concurrent background re-fetches for the
same cache key.
"""

import asyncio
import functools
import hashlib
import json
import logging
from typing import Any, Callable, Optional, Type, TypeVar

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.db.cache_store import _DEFAULT_STALE_SECONDS, cache_client as redis_client

T = TypeVar("T")

_refreshing_keys: set[str] = set()


def cache_response(
    ttl_seconds: int = 315360000,
    stale_seconds: int = _DEFAULT_STALE_SECONDS,
    key_prefix: str = "filim:cache:v2:",
    response_model: Optional[Type[BaseModel]] = None,
):
    """Permanently cache function results with stale-while-revalidate semantics."""

    def decorator(func: Callable[..., Any]):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_args = args[1:] if args and hasattr(args[0], "__class__") else args
            arg_str = json.dumps([cache_args, kwargs], sort_keys=True, default=str)
            arg_hash = hashlib.md5(arg_str.encode()).hexdigest()
            key = f"{key_prefix}{func.__name__}:{arg_hash}"

            try:
                cached = await redis_client.get(key)
                if cached:
                    if await redis_client.is_stale(key) and key not in _refreshing_keys:
                        _refreshing_keys.add(key)
                        asyncio.create_task(
                            _background_refresh(
                                func, args, kwargs, key, stale_seconds, ttl_seconds
                            )
                        )
                    data = json.loads(cached)
                    if response_model:
                        if isinstance(data, list):
                            return [
                                response_model.model_validate(item) for item in data
                            ]
                        return response_model.model_validate(data)
                    return data
            except Exception:
                logging.exception(f"Cache read error for key: {key}")

            result = await func(*args, **kwargs)

            cacheable = result is not None and result != [] and result != {}
            if cacheable:
                try:
                    data_to_cache = jsonable_encoder(result)
                    await redis_client.setex(
                        key,
                        ttl_seconds,
                        json.dumps(data_to_cache),
                        stale_seconds=stale_seconds,
                    )
                except Exception:
                    logging.exception(f"Cache write error for key: {key}")

            return result

        return wrapper

    return decorator


async def bust_cache_entry(
    func_name: str, key_prefix: str = "filim:cache:v2:", *args: Any, **kwargs: Any
) -> None:
    """Delete a single cache entry by function name + args+kwargs (mirrors cache_response key generation)."""
    arg_str = json.dumps([args, kwargs], sort_keys=True, default=str)
    arg_hash = hashlib.md5(arg_str.encode()).hexdigest()
    key = f"{key_prefix}{func_name}:{arg_hash}"
    try:
        await redis_client.delete(key)
    except Exception:
        logging.warning("Cache bust failed for key: %s", key)


async def _background_refresh(
    func: Callable,
    args: tuple,
    kwargs: dict,
    key: str,
    stale_seconds: int,
    ttl_seconds: int = 315360000,
) -> None:
    try:
        result = await func(*args, **kwargs)
        cacheable = result is not None and result != [] and result != {}
        if cacheable:
            data_to_cache = jsonable_encoder(result)
            await redis_client.setex(
                key,
                ttl_seconds,
                json.dumps(data_to_cache),
                stale_seconds=stale_seconds,
            )
            logging.debug("Background refresh complete for key: %s", key)
    except Exception:
        logging.warning("Background refresh failed for key: %s", key)
    finally:
        _refreshing_keys.discard(key)
