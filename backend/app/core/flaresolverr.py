from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

FLARESOLVERR_URL = settings.flaresolverr_url
_TIMEOUT = 90.0

# Persistent browser session — CF challenge solved once, reused across requests.
_session_id: str | None = None
_session_lock: asyncio.Lock | None = None

# Persistent httpx client — avoids TCP handshake overhead to localhost:8191.
_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=_TIMEOUT, http2=False)
    return _http_client


def _get_lock() -> asyncio.Lock:
    global _session_lock
    if _session_lock is None:
        _session_lock = asyncio.Lock()
    return _session_lock


async def _get_session(client: httpx.AsyncClient) -> str | None:
    """Return cached session ID, creating one if needed."""
    global _session_id
    async with _get_lock():
        if _session_id:
            return _session_id
        try:
            resp = await client.post(FLARESOLVERR_URL, json={"cmd": "sessions.create"})
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "ok":
                _session_id = data["session"]
                logging.info("FlareSolverr: created session %s", _session_id)
                return _session_id
        except Exception as exc:
            logging.warning("FlareSolverr: could not create session: %s", exc)
        return None


async def _destroy_session(_client: httpx.AsyncClient | None = None) -> None:
    global _session_id
    async with _get_lock():
        sid = _session_id
        _session_id = None
    if sid:
        try:
            c = _client or _get_client()
            await c.post(
                FLARESOLVERR_URL, json={"cmd": "sessions.destroy", "session": sid}
            )
        except Exception:
            pass


async def destroy_all_sessions() -> None:
    await _destroy_session()


def _parse_body(body: str) -> dict[str, Any] | None:
    """Strip FlareSolverr's HTML wrapper and parse JSON."""
    if not body:
        return None
    pre_match = re.search(r"<pre[^>]*>([\s\S]*?)</pre>", body, re.IGNORECASE)
    if pre_match:
        body = pre_match.group(1).strip()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        logging.error(
            "FlareSolverr response is not JSON (first 200 chars): %s", body[:200]
        )
        return None


async def flarefetch(url: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    """Fetch a Cloudflare-protected URL through FlareSolverr.

    Uses a persistent browser session so the CF challenge is solved once and
    reused, cutting per-request overhead from ~12 s to ~1-2 s.
    Uses a persistent httpx client to avoid TCP handshake overhead.
    """
    if params:
        from urllib.parse import urlencode

        full_url = f"{url}?{urlencode(params)}"
    else:
        full_url = url

    client = _get_client()
    session_id = await _get_session(client)

    payload: dict[str, Any] = {
        "cmd": "request.get",
        "url": full_url,
        "maxTimeout": 60000,
    }
    if session_id:
        payload["session"] = session_id

    try:
        resp = await client.post(FLARESOLVERR_URL, json=payload)
        resp.raise_for_status()
    except Exception as exc:
        logging.error("FlareSolverr request failed: %s", exc)
        return {}

    fs_data = resp.json()
    if fs_data.get("status") != "ok":
        msg = fs_data.get("message", "")
        logging.error("FlareSolverr returned error: %s", msg)
        # Session may have expired — drop it so next call recreates.
        if session_id and ("session" in msg.lower() or "expired" in msg.lower()):
            await _destroy_session(client)
        return {}

    body = fs_data.get("solution", {}).get("response", "")
    parsed = _parse_body(body)
    if parsed is None:
        return {}
    return parsed
