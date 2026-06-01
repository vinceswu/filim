from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import proxy_img_url as _proxy_img
from app.db.session import get_db
from app.sessions import SessionService, WatchProgressModel


class ProgressBody(BaseModel):
    show_id: str
    episode: str
    position_seconds: float
    duration_seconds: float
    is_finished: Optional[bool] = None


class ContinueWatchingItem(BaseModel):
    show_id: str | None = None
    episode: str
    position_seconds: float
    duration_seconds: float
    progress: float
    show_title: Optional[str] = None
    cover_image_url: Optional[str] = None


router = APIRouter()


def _get_session_service(db: AsyncSession = Depends(get_db)) -> SessionService:
    return SessionService(db=db)


@router.post("/user/progress")
async def update_progress(
    body: ProgressBody,
    request: Request,
    x_device_token: str | None = Header(None, alias="X-Device-Token"),
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: SessionService = Depends(_get_session_service),
) -> dict[str, str]:
    await service.update_progress(
        device_token=x_device_token,
        client_ip=request.client.host if request.client else None,
        profile_id=x_profile_id,
        show_id=body.show_id,
        episode=body.episode,
        position_seconds=body.position_seconds,
        duration_seconds=body.duration_seconds,
        is_finished=body.is_finished,
    )
    return {"status": "ok"}


@router.get("/user/continue-watching")
async def continue_watching(
    request: Request,
    x_device_token: str | None = Header(None, alias="X-Device-Token"),
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: SessionService = Depends(_get_session_service),
) -> dict[str, list[ContinueWatchingItem]]:
    rows: list[WatchProgressModel] = await service.get_continue_watching(
        device_token=x_device_token,
        client_ip=request.client.host if request.client else None,
        profile_id=x_profile_id,
    )
    items: list[ContinueWatchingItem] = []
    for row in rows:
        progress = (
            row.position_seconds / row.duration_seconds
            if row.duration_seconds > 0
            else 0.0
        )
        items.append(
            ContinueWatchingItem(
                show_id=row.show_id,
                episode=row.episode,
                position_seconds=row.position_seconds,
                duration_seconds=row.duration_seconds,
                progress=progress,
                show_title=row.show_title,
                cover_image_url=_proxy_img(row.cover_image_url),
            )
        )
    return {"items": items}


@router.get("/user/progress/{show_id}")
async def get_show_progress(
    show_id: str,
    request: Request,
    x_device_token: str | None = Header(None, alias="X-Device-Token"),
    x_profile_id: str | None = Header(None, alias="X-Profile-Id"),
    service: SessionService = Depends(_get_session_service),
) -> dict[str, list[ContinueWatchingItem]]:
    rows: list[WatchProgressModel] = await service.get_show_progress(
        device_token=x_device_token,
        client_ip=request.client.host if request.client else None,
        profile_id=x_profile_id,
        show_id=show_id,
    )
    items: list[ContinueWatchingItem] = []
    for row in rows:
        progress = (
            row.position_seconds / row.duration_seconds
            if row.duration_seconds > 0
            else 0.0
        )
        items.append(
            ContinueWatchingItem(
                show_id=row.show_id,
                episode=row.episode,
                position_seconds=row.position_seconds,
                duration_seconds=row.duration_seconds,
                progress=progress,
                show_title=row.show_title,
                cover_image_url=_proxy_img(row.cover_image_url),
            )
        )
    return {"items": items}
