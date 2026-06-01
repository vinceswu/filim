from fastapi import APIRouter

from app.api import (
    admin,
    catalog,
    preferences,
    profiles,
    recommendations,
    sessions,
    streams,
)

router = APIRouter()

router.include_router(admin.router, prefix="/admin", tags=["admin"])
router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
router.include_router(streams.router, prefix="/stream", tags=["streams"])
router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
router.include_router(sessions.router, tags=["devices", "sessions"])
router.include_router(recommendations.router, tags=["recommendations"])
router.include_router(preferences.router, prefix="/user", tags=["preferences"])
