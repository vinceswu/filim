from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.streams.service import StreamVariantModel


class AudioLanguageModel(BaseModel):
    """Describes an available audio language track for a stream manifest.

    This is intentionally minimal so the frontend can present stable labels
    alongside the audio tracks exposed by the HLS manifest at runtime.
    """

    id: str
    code: Optional[str] = None
    label: str
    is_default: bool = False


class StreamResponseModel(BaseModel):
    """API response shape for an episode stream request."""

    manifest_url: str
    variants: list[StreamVariantModel]
    audio_languages: list[AudioLanguageModel] = []
