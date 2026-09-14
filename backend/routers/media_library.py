"""Media library — per-user workspaces on top of S3.

Staff (admin | manager | field_staff):
  POST   /api/media-library                upload into own workspace
  GET    /api/media-library                list / search / sort / paginate                (Tasks 6-9)
  GET    /api/media-library/{id}           detail + site-usage cross-reference              (Tasks 6-9)
  PATCH  /api/media-library/{id}           edit title / description / tags                  (Tasks 6-9)
  POST   /api/media-library/{id}/submit    owner: private -> submitted                      (Tasks 6-9)
  DELETE /api/media-library/{id}           owner (private only) or admin/manager             (Tasks 6-9)

Admin or manager only:
  GET    /api/media-library/workspaces     workspaces with counts and total size             (Tasks 6-9)
  POST   /api/media-library/{id}/review    approve -> public, reject -> private               (Tasks 6-9)
  POST   /api/media-library/{id}/reassign  move an asset into another workspace               (Tasks 6-9)

Only the upload endpoint above exists so far; every other line in these two
lists is a stub for Tasks 6-9. Byte serving lives in media_library_files.py.
"""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime  # noqa: F401 — unused until Tasks 6-9 (listing/sort)
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.encoders import jsonable_encoder
# BaseModel/Field, Query, get_current_manager_or_admin, search_pattern,
# tag_filter_pattern, _load_asset and _require_can_edit below are all unused
# by the upload endpoint alone — they exist for Tasks 6-9 (listing, detail,
# edit, review, reassign) to build on without re-deriving them.
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
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
    sniff_content_type,
    tag_filter_pattern,
    unsupported_hint,
    validate_tags,
    IMAGE_CONTENT_TYPES,
)
from media_processing import (
    compress_image,
    compress_video,
    generate_video_thumbnail,
    should_compress_image,
    should_compress_video,
    strip_image_metadata,
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


def _image_dimensions(data: bytes):
    """(width, height) for image bytes, or (None, None) if unreadable."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except Exception:
        return (None, None)


# Staged for Tasks 6-9 (detail/edit/submit/review/reassign): no route below
# calls these yet.
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
    # Not Form(..., max_length=200): FastAPI turns a Pydantic max_length
    # violation into a 422 with a Pydantic-shaped error body, not the plain
    # 400 this endpoint uses for every other input problem (verified against
    # a throwaway FastAPI app before writing this). A manual check keeps the
    # error shape consistent and, unlike letting it reach db.commit(),
    # catches it before a staff member's 100 MB video upload is thrown away
    # over a VARCHAR(200) title -- PostgreSQL raises DataError there, which
    # the except SQLAlchemyError below reports as a generic 500, and SQLite
    # (this suite's engine) does not enforce column length at all, so this
    # path is otherwise untestable.
    if title is not None and len(title) > 200:
        raise HTTPException(status_code=400, detail="Title is longer than 200 characters.")

    # Cheap, header/filename-only pre-check so an obviously unsupported
    # upload (a .txt file, an unlisted format) 400s before its bytes are
    # even read. This is *not* the security gate — declared type is
    # attacker-controlled — just an early exit; the sniff below is what a
    # spoofed upload actually has to get past.
    quick_media_type = detect_media_type(file.filename, file.content_type)
    if quick_media_type is None:
        hint = unsupported_hint(file.filename, file.content_type)
        raise HTTPException(
            status_code=400,
            detail=hint or "Unsupported file type. Upload an image or a video.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than the {MAX_MEDIA_UPLOAD_MB} MB limit.",
        )

    # The declared type and filename extension got us this far; the bytes
    # have to agree, at the specific-format level, before anything reaches
    # Pillow or ffmpeg. sniff_content_type() returns every Content-Type alias
    # the bytes are consistent with; requiring the declared header to be a
    # *member* of that set — not merely of the right image/video category —
    # is what stops a caller from declaring image/gif (a format
    # should_compress_image() always skips, and so never gets re-encoded)
    # over real JPEG bytes to dodge metadata stripping below. This also
    # doubles as "never store the raw header": whatever passes here is
    # already one of the aliases this module allow-lists, never anything
    # attacker-chosen wholesale — a file named a.jpg, declared text/html,
    # containing a real GIF is rejected here rather than ever being stored
    # (and later served) as text/html, which would be stored XSS on the
    # serving origin.
    declared = (file.content_type or "").split(";", 1)[0].strip().lower()
    sniffed_content_types = sniff_content_type(content)
    if sniffed_content_types is None or declared not in sniffed_content_types:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared type.",
        )

    media_type = "image" if sniffed_content_types & IMAGE_CONTENT_TYPES else "video"
    content_type = declared
    width = height = None
    thumbnail_bytes = None

    if media_type == "image":
        if should_compress_image(content_type):
            compressed = compress_image(content)
            # compress_image() returns the original object, unchanged, if
            # Pillow couldn't process it — relabel only when it actually
            # produced new (JPEG) bytes, or a PNG Pillow chokes on would be
            # stored as PNG bytes wearing an image/jpeg label.
            if compressed is not content:
                content, content_type = compressed, "image/jpeg"
        # GPS/EXIF must never reach the public site (Task 8 publishes
        # approved assets there). Unconditional — not gated on
        # should_compress_image() — because that gate is exactly what a
        # spoofed-Content-Type upload would use to dodge stripping if this
        # depended on it; see strip_image_metadata()'s docstring.
        stripped = strip_image_metadata(content)
        if stripped is not content:
            content = stripped
        width, height = _image_dimensions(content)
    else:
        if should_compress_video(content_type):
            content = compress_video(content)
            # Symmetric with the image branch above: compress_video()
            # transcodes into H.264/MP4 regardless of the source container,
            # so a 3GP upload stored under its original video/3gpp label
            # would be MP4 bytes wearing a Content-Type nothing plays.
            content_type = "video/mp4"
        thumbnail_bytes = generate_video_thumbnail(content)

    checksum = hashlib.sha256(content).hexdigest()
    # Advisory by design, not enforced with a unique constraint — see
    # migration 31's comment on idx_media_assets_owner_checksum: a unique
    # constraint would block a legitimate re-upload after a delete, and
    # PostgreSQL treats NULLs as distinct so the "Unassigned" workspace
    # would slip through it anyway. That also means this check-then-insert
    # is not race-free — two concurrent identical uploads from the same
    # user can both pass this SELECT and both land — which is accepted,
    # not a bug to "fix" by adding a constraint here.
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
        # Truncated, not rejected: the caller didn't choose this value (it's
        # whatever the uploading client sent) and it's display-only, so a
        # 400 here would only make them retry the same 100 MB upload for
        # something that isn't their fault. filename is VARCHAR(255); title
        # gets the same treatment via Form(..., max_length=200) above
        # instead, because a title the user *did* type deserves an honest
        # 400 rather than a silent truncation.
        filename=(file.filename or "upload")[:255],
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
    except SQLAlchemyError as exc:
        db.rollback()
        # S3 first, row second (see the comment above upload_file()): a
        # failed insert must not leave an object with nothing pointing at
        # it. delete_file() returns False rather than raising on failure, so
        # that has to be checked explicitly — an unchecked call here would
        # silently leave exactly the orphan this compensating delete exists
        # to prevent, recoverable only via cleanup.py's sweep.
        if not delete_file(object_key, cleanup_db=False):
            logger.error("Insert failed and S3 cleanup also failed; orphan object left at %s", object_key)
        if thumbnail_key and not delete_file(thumbnail_key, cleanup_db=False):
            logger.error("Insert failed and S3 cleanup also failed; orphan thumbnail left at %s", thumbnail_key)
        logger.error("Could not index uploaded media %s: %s", object_key, exc)
        raise HTTPException(status_code=500, detail="Could not save the uploaded file.") from exc

    return _serialize(asset)
