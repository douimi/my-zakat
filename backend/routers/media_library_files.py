"""Media library byte serving.

  GET /api/media-library/{id}/file   the asset itself
  GET /api/media-library/{id}/thumb  its thumbnail

Kept apart from media_library.py because this is the path where a mistake leaks a
photo. There is exactly one rule here, and it reads the `status` column:

  public              -> anyone, cacheable
  private | submitted -> the owner, an admin or a manager; everyone else gets 404
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth_utils import role_of, get_optional_user
from database import get_db
from logging_config import get_logger
from models import MediaAsset, User
from routers.static_files import stream_s3_object
from s3_service import download_file, file_exists

logger = get_logger(__name__)
router = APIRouter()

PUBLIC_CACHE = 'public, max-age=86400'
PRIVATE_CACHE = 'private, no-store'


def _visible_asset(db: Session, asset_id: int, user: Optional[User]) -> MediaAsset:
    """The asset, if this caller may read its bytes. Otherwise 404.

    404 rather than 403 throughout: a 403 tells an unauthorised caller that the
    asset exists.
    """
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media not found")

    if asset.status == "public":
        return asset
    if user is None:
        raise HTTPException(status_code=404, detail="Media not found")
    if role_of(user) in ("admin", "manager"):
        return asset
    if asset.owner_id == user.id:
        return asset
    raise HTTPException(status_code=404, detail="Media not found")


@router.get("/{asset_id}/file")
@router.head("/{asset_id}/file")
async def serve_media_file(
    asset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Serve the asset bytes, subject to its status."""
    asset = _visible_asset(db, asset_id, user)

    if not file_exists(asset.object_key):
        logger.warning("Media row %s points at a missing object %s", asset.id, asset.object_key)
        raise HTTPException(status_code=404, detail="Media not found")

    return stream_s3_object(
        asset.object_key,
        request,
        content_type=asset.content_type,
        cache_control=PUBLIC_CACHE if asset.status == "public" else PRIVATE_CACHE,
    )


@router.get("/{asset_id}/thumb")
async def serve_media_thumbnail(
    asset_id: int,
    request: Request,
    w: int = 0,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Serve the thumbnail, falling back to the image itself when there is none."""
    from fastapi.responses import Response
    from image_cache import cache_get, cache_put, make_cache_key, resize_image

    asset = _visible_asset(db, asset_id, user)
    key = asset.thumbnail_key or (asset.object_key if asset.media_type == "image" else None)
    if key is None:
        raise HTTPException(status_code=404, detail="No thumbnail for this media")

    cache_control = PUBLIC_CACHE if asset.status == "public" else PRIVATE_CACHE

    if not w:
        return stream_s3_object(key, request, content_type="image/jpeg",
                                cache_control=cache_control)

    cache_key = make_cache_key(key, width=w, fmt="jpeg")
    cached = cache_get(cache_key)
    if cached is not None:
        data, content_type = cached
        return Response(content=data, media_type=content_type,
                        headers={'Cache-Control': cache_control})

    original = download_file(key)
    if original is None:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    data, content_type = resize_image(original, target_width=w, output_format="JPEG")
    cache_put(cache_key, data, content_type)
    return Response(content=data, media_type=content_type,
                    headers={'Cache-Control': cache_control})
