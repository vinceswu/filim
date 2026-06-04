import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import settings
from app.core.logger import setup_logging


def create_app() -> FastAPI:
    """Application factory for the Filim backend."""

    setup_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        from app.core.catalog_refresh import run_catalog_refresh
        from app.core.warmup import run_warmup
        from app.db.cache_store import cache_client
        from app.db.session import AsyncSessionLocal

        await cache_client.start_cleanup()
        warmup_task = asyncio.create_task(run_warmup())
        refresh_task = asyncio.create_task(run_catalog_refresh(AsyncSessionLocal))
        yield
        for task in (warmup_task, refresh_task):
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        from app.core.flaresolverr import destroy_all_sessions

        await destroy_all_sessions()
        await cache_client.stop_cleanup()

    app = FastAPI(
        title="Filim Backend",
        description="A streaming platform for anime, shows, and movies.",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def log_request_time(request: Request, call_next):
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = (time.perf_counter() - start_time) * 1000

        logging.info(
            f"{request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.2f}ms"
        )
        return response

    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="loopback")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api import router as api_router

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
