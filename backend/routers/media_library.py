"""Media library — per-user workspaces on top of S3.

Staff (admin | manager | field_staff):
  POST   /api/media-library                upload into own workspace
  GET    /api/media-library                list / search / sort / paginate
  GET    /api/media-library/{id}           detail + site-usage cross-reference
  PATCH  /api/media-library/{id}           edit title / description / tags
  POST   /api/media-library/{id}/submit    owner: private -> submitted
  DELETE /api/media-library/{id}           owner (private only) or admin/manager

Admin or manager only:
  GET    /api/media-library/workspaces     workspaces with counts and total size
  POST   /api/media-library/{id}/review    approve -> public, reject -> private
  POST   /api/media-library/{id}/reassign  move an asset into another workspace

Byte serving lives in media_library_files.py.
"""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth_utils import role_of, get_current_manager_or_admin, get_current_staff
from database import get_db
from logging_config import get_logger
from media_library_service import (
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    detect_media_type,
    normalize_tags,
    parse_tag_input,
    search_pattern,
    tag_filter_pattern,
    validate_tags,
    IMAGE_CONTENT_TYPES,
    VIDEO_CONTENT_TYPES,
)
from media_processing import (
    compress_image,
    compress_video,
    generate_video_thumbnail,
    should_compress_image,
    should_compress_video,
)
from models import MediaAsset, User
from s3_service import delete_file, upload_file

logger = get_logger(__name__)
router = APIRouter()

MAX_MEDIA_UPLOAD_MB = int(os.getenv("MAX_MEDIA_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MB * 1024 * 1024


# ── Helpers ──────────────────────────────────────────────────────────

def _serialize(asset: MediaAsset) -> dict:
    has_thumbnail = bool(asset.thumbnail_key) or asset.media_type == "image"
    return {
        "id": asset.id,
        "owner_id": asset.owner_id,
        "object_key": asset.object_key,
        "filename": asset.filename,
        "media_type": asset.media_type,
        "content_type": asset.content_type,
        "size_bytes": asset.size_bytes,
        "width": asset.width,
        "height": asset.height,
        "duration_seconds": asset.duration_seconds,
        "title": asset.title,
        "description": asset.description,
        "tags": asset.tags or [],
        "status": asset.status,
        "review_note": asset.review_note,
        "reviewed_at": asset.reviewed_at,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "url": f"/api/media-library/{asset.id}/file",
        "thumbnail_url": f"/api/media-library/{asset.id}/thumb" if has_thumbnail else None,
    }


# Leading bytes for the formats we accept. The declared Content-Type is attacker
# controlled; this is not.
_MAGIC = (
    (b"\xff\xd8\xff", "image"),                 # jpeg
    (b"\x89PNG\r\n\x1a\n", "image"),       # png
    (b"GIF87a", "image"),
    (b"GIF89a", "image"),
    (b"BM", "image"),                              # bmp
)


def _sniffed_type(content: bytes) -> Optional[str]:
    """Media type implied by the file's own leading bytes, or None."""
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image"
    # ISO base media (mp4/mov/m4v/3gp) puts an 'ftyp' box at offset 4.
    if content[4:8] == b"ftyp":
        return "video"
    if content[:4] == b"\x1a\x45\xdf\xa3":    # matroska / webm
        return "video"
    for prefix, kind in _MAGIC:
        if content.startswith(prefix):
            return kind
    return None


def _image_dimensions(data: bytes):
    """(width, height) for image bytes, or (None, None) if unreadable."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except Exception:
        return (None, None)


def _load_asset(db: Session, asset_id: int) -> MediaAsset:
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media not found")
    return asset


def _require_can_edit(asset: MediaAsset, user: User) -> None:
    """Owner, admin or manager. 404 rather than 403: a 403 confirms it exists."""
    if role_of(user) in ("admin", "manager"):
        return
    if asset.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Media not found")


# ── Upload ───────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Upload one photo or video into the caller's own workspace."""
    media_type = detect_media_type(file.filename, file.content_type)
    if media_type is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload an image or a video.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than the {MAX_MEDIA_UPLOAD_MB} MB limit.",
        )

    # The declared type got us this far; the bytes have to agree before we hand
    # them to Pillow or ffmpeg.
    if _sniffed_type(content) != media_type:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared type.",
        )

    # Never store the raw header. A file named a.jpg, declared text/html, whose
    # body is a real GIF passes both the extension fallback and the byte sniff —
    # and would then be stored and served as text/html, which is stored XSS on
    # the serving origin. The stored type comes from the allow-list or not at all.
    declared = (file.content_type or "").split(";", 1)[0].strip().lower()
    allowed = IMAGE_CONTENT_TYPES if media_type == "image" else VIDEO_CONTENT_TYPES
    content_type = declared if declared in allowed else (
        "image/jpeg" if media_type == "image" else "video/mp4"
    )
    width = height = None
    thumbnail_bytes = None

    if media_type == "image":
        if should_compress_image(content_type):
            content = compress_image(content)
            content_type = "image/jpeg"
        width, height = _image_dimensions(content)
    else:
        if should_compress_video(content_type):
            content = compress_video(content)
        thumbnail_bytes = generate_video_thumbnail(content)

    checksum = hashlib.sha256(content).hexdigest()
    duplicate = (
        db.query(MediaAsset)
        .filter(
            MediaAsset.owner_id == current_user.id,
            MediaAsset.checksum_sha256 == checksum,
        )
        .first()
    )
    if duplicate is not None:
        # Starlette's default HTTPException handler json.dumps()s `detail`
        # directly rather than routing it through FastAPI's response
        # pipeline, so it never sees jsonable_encoder — a raw datetime in
        # _serialize(duplicate) would otherwise turn this 409 into an
        # unhandled 500 at encode time. Encode here so callers reliably see
        # a 409 with the existing asset attached, not a 500.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This file is already in your workspace.",
                "existing": jsonable_encoder(_serialize(duplicate)),
            },
        )

    # parse_tag_input drops blank entries first: "" and a trailing comma mean
    # "no tags", not "an empty tag" — without it, an upload with no tags at all
    # would 400. validate_tags then only sees things the user actually typed,
    # and is the write-path gate that tells them instead of silently rewriting
    # (normalize_tags stays lenient because it also runs on the read path).
    tag_input = parse_tag_input(tags)
    tag_problems = validate_tags(tag_input)
    if tag_problems:
        raise HTTPException(status_code=400, detail={"tags": tag_problems})

    parsed_tags = normalize_tags(tag_input)
    object_key = build_object_key(current_user.id, file.filename)
    thumbnail_key = None

    # S3 first, row second: an orphan object is recoverable, a row pointing at
    # nothing is not.
    upload_file(content, object_key, content_type=content_type)
    if thumbnail_bytes:
        thumbnail_key = build_thumbnail_key(object_key)
        try:
            upload_file(thumbnail_bytes, thumbnail_key, content_type="image/jpeg")
        except Exception as exc:
            logger.warning("Thumbnail upload failed for %s: %s", object_key, exc)
            thumbnail_key = None

    asset = MediaAsset(
        owner_id=current_user.id,
        object_key=object_key,
        filename=file.filename or "upload",
        media_type=media_type,
        content_type=content_type,
        size_bytes=len(content),
        width=width,
        height=height,
        thumbnail_key=thumbnail_key,
        checksum_sha256=checksum,
        title=(title or None),
        description=(description or None),
        tags=parsed_tags,
        search_text=build_search_text(file.filename, title, description, parsed_tags),
        status="private",
    )

    try:
        db.add(asset)
        db.commit()
        db.refresh(asset)
    except Exception as exc:
        db.rollback()
        delete_file(object_key, cleanup_db=False)
        if thumbnail_key:
            delete_file(thumbnail_key, cleanup_db=False)
        logger.error("Could not index uploaded media %s: %s", object_key, exc)
        raise HTTPException(status_code=500, detail="Could not save the uploaded file.")

    return _serialize(asset)
