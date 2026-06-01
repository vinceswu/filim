from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.recommendations import RecommendationSectionModel, RecommendationService

router = APIRouter()


def _get_recommendation_service(
    db: AsyncSession = Depends(get_db),
) -> RecommendationService:
    return RecommendationService(db=db)


@router.get("/recommendations")
async def get_device_recommendations(
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: RecommendationService = Depends(_get_recommendation_service),
) -> dict[str, list[RecommendationSectionModel]]:
    sections = await service.get_device_recommendations(
        device_token="", profile_id=x_profile_id
    )
    return {"sections": sections}


@router.get("/catalog/recommended")
async def get_global_recommended(
    service: RecommendationService = Depends(_get_recommendation_service),
) -> dict[str, list[RecommendationSectionModel]]:
    sections = await service.get_global_recommendations()
    return {"sections": sections}


@router.get("/recommendations/discovery")
async def get_discovery_sections(
    cursor: int = Query(0, ge=0),
    limit: int = Query(3, ge=1, le=50),
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: RecommendationService = Depends(_get_recommendation_service),
) -> dict[str, Any]:
    sections, next_cursor = await service.get_discovery_sections(
        cursor=cursor, limit=limit, profile_id=x_profile_id
    )
    return {"sections": sections, "next_cursor": next_cursor}
