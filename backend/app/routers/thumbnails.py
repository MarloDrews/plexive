"""Thumbnail generation endpoints (admin only).

Admin-gated for two reasons: rendering costs real CPU, and each render can hit
Nominatim, whose usage policy we are responsible for. Rate limited on top of
that.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..rate_limit import check_rate_limit
from ..schemas import GeographyThumbnailRequest, ThumbnailInfo
from ..thumbnails import basemap
from ..thumbnails.fonts import FontError
from ..thumbnails.nominatim import GeoLookupError
from ..thumbnails.service import render_geography_thumbnail
from .admin import require_admin

logger = logging.getLogger("app.thumbnails.api")

router = APIRouter(prefix="/thumbnails", tags=["thumbnails"])


def _render(payload: GeographyThumbnailRequest):
    """Shared render + error mapping for both response shapes."""
    try:
        return render_geography_thumbnail(
            place=payload.place,
            osm_id=payload.osm_id,
            caption=payload.caption,
            padding=payload.padding,
            width=payload.width,
            height=payload.height,
            uppercase=payload.uppercase,
            highlight_under_land=payload.highlight_under_land,
            clip_to_land=payload.clip_to_land,
            source=payload.source,
            palette=payload.palette,
            seed=payload.seed,
        )
    except GeoLookupError as exc:
        # The caller's place name is the problem, or OSM is down. Either way it
        # is not a server bug, and the message is safe to show.
        raise HTTPException(status_code=400, detail=str(exc))
    except basemap.BasemapError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except FontError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/geography", response_class=Response, responses={200: {"content": {"image/png": {}}}})
def geography_thumbnail(
    payload: GeographyThumbnailRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Render a 1280x720 card: grey world map, one region coloured, caption banner.

    Returns the PNG itself. What OSM matched comes back in the X-Place-Name /
    X-Osm-Id headers, so a mis-picked region is visible without a second call.
    """
    # Sync def: the render is CPU-bound and the OSM call blocks, so FastAPI
    # runs this in the threadpool and the event loop stays free.
    check_rate_limit(current_user.id, "thumbnail_render", 60, 3600)
    thumbnail = _render(payload)
    return Response(
        content=thumbnail.png,
        media_type="image/png",
        headers={
            "X-Place-Name": thumbnail.place_name.encode("ascii", "replace").decode("ascii"),
            "X-Osm-Id": f"{(thumbnail.osm_type or '?')[:1].upper()}{thumbnail.osm_id}",
            "Content-Disposition": 'inline; filename="thumbnail.png"',
        },
    )


@router.post("/geography/preview", response_model=ThumbnailInfo)
def geography_thumbnail_preview(
    payload: GeographyThumbnailRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Same render, returned as a base64 data URL plus the match metadata.

    For clients that want to show the result inline and confirm the region
    before saving it anywhere.
    """
    import base64

    check_rate_limit(current_user.id, "thumbnail_render", 60, 3600)
    thumbnail = _render(payload)
    return ThumbnailInfo(
        data_url="data:image/png;base64," + base64.b64encode(thumbnail.png).decode("ascii"),
        width=thumbnail.width,
        height=thumbnail.height,
        place_name=thumbnail.place_name,
        osm_type=thumbnail.osm_type,
        osm_id=thumbnail.osm_id,
        caption_lines=thumbnail.caption_lines,
        source=thumbnail.source,
        palette=thumbnail.palette,
    )


@router.get("/basemap/status")
def basemap_status(current_user: User = Depends(require_admin)):
    """Which basemap layers are already on disk (None = will download on first use)."""
    return {"layers": basemap.cached_layers()}
