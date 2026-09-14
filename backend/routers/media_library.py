"""Media library — per-user workspaces on top of S3.

Staff (admin | manager | field_staff):
  POST   /api/media-library                upload into own workspace
  GET    /api/media-library                list / search / sort / paginate
  GET    /api/media-library/{id}           detail + site-usage cross-reference
  PATCH  /api/media-library/{id}           edit title / description / tags
  POST   /api/media-library/{id}/submit    owner: private -> submitted                      (Task 8)
  DELETE /api/media-library/{id}           owner (private only) or admin/manager             (Task 9)

Admin or manager only:
  GET    /api/media-library/workspaces     workspaces with counts and total size
  POST   /api/media-library/{id}/review    approve -> public, reject -> private               (Task 8)
  POST   /api/media-library/{id}/reassign  move an asset into another workspace

Upload, listing, detail, metadata editing, reassignment and the workspaces
summary shipped in Tasks 5-7. Submit/review/delete are still stubs for
Tasks 8-9. Byte serving lives in media_library_files.py.
"""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime  # noqa: F401 — unused until Task 8 (review sets reviewed_at)
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth_utils import MANAGER_ROLES, STAFF_ROLES, role_of, get_current_manager_or_admin, get_current_staff
from database import get_db
from logging_config import get_logger
from media_library_service import (
    asset_file_url,
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    canonical_content_type,
    detect_media_type,
    is_allow_listed_content_type,
    media_type_of,
    normalize_tags,
    parse_tag_input,
    search_pattern,
    serialize_asset,
    sniff_content_type,
    tag_filter_pattern,
    unsupported_hint,
    validate_tags,
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
from routers.s3_media import get_media_usage
from s3_service import delete_file, upload_file

logger = get_logger(__name__)
router = APIRouter()

MAX_MEDIA_UPLOAD_MB = int(os.getenv("MAX_MEDIA_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MB * 1024 * 1024


# ── Helpers ──────────────────────────────────────────────────────────

def _image_dimensions(data: bytes):
    """(width, height) for image bytes, or (None, None) if unreadable."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except Exception:
        return (None, None)


def usage_for_asset(asset_id: int, db: Session) -> dict:
    """Where an asset is used across the public site.

    Thin wrapper over routers.s3_media.get_media_usage so every caller goes
    through asset_file_url() for the string it matches on, rather than each
    retyping it — see that function's docstring for why a second spelling
    would be a silent failure, not a loud one.
    """
    return get_media_usage(asset_file_url(asset_id), db)


def _load_asset(db: Session, asset_id: int) -> MediaAsset:
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media not found")
    return asset


def _is_reviewer(user: User) -> bool:
    """Admin or manager: the two roles that see and moderate every workspace."""
    return role_of(user) in MANAGER_ROLES


def _require_can_view(asset: MediaAsset, user: User) -> None:
    """Owner, admin or manager. 404 rather than 403: a 403 confirms it exists."""
    if _is_reviewer(user):
        return
    if asset.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Media not found")


def _require_can_edit(asset: MediaAsset, user: User) -> None:
    """Owner, admin or manager — except a non-admin owner may not edit a
    public asset.

    Reassignment can hand a field-staff member ownership of an asset that is
    already live on the public site; once it is public, changing its title,
    description or tags is a reviewer action, not an owner action. This is a
    real 403, not the existence-hiding 404 above: the owner already knows
    the asset exists (it's in their own workspace) and is being told about a
    genuine permission, not probing for one.
    """
    _require_can_view(asset, user)
    if _is_reviewer(user):
        return
    if asset.status == "public":
        raise HTTPException(
            status_code=403,
            detail="This media is public. Only a reviewer can edit it now.",
        )


# Staged for Task 9 (delete): no route below calls this yet.
def _require_can_delete(asset: MediaAsset, user: User) -> None:
    """Owner may delete only while private; admin/manager always."""
    _require_can_view(asset, user)
    if _is_reviewer(user):
        return
    if asset.status != "private":
        raise HTTPException(
            status_code=403,
            detail="Only a private asset may be deleted by its owner.",
        )


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

    # The bytes have to say what they are before anything reaches Pillow or
    # ffmpeg — sniff_content_type() returns every Content-Type alias the
    # bytes are consistent with, or None if they match no format this module
    # recognises at all (a forged/corrupt/unsupported upload).
    declared = (file.content_type or "").split(";", 1)[0].strip().lower()
    sniffed_content_types = sniff_content_type(content)
    if sniffed_content_types is None:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared type.",
        )

    # A declared type that IS allow-listed but ISN'T consistent with the
    # sniffed bytes is the spoof this endpoint exists to catch (image/gif —
    # a format should_compress_image() always skips, and so never gets
    # re-encoded — declared over real JPEG bytes, to dodge the metadata
    # stripping below). A declared type that is missing, or a generic
    # default like application/octet-stream (what curl -F and some mobile
    # webviews send with no OS MIME mapping to consult), is not a claim at
    # all, so there is nothing to contradict — that used to reach here as a
    # 400 too, which is the regression a re-review caught: nothing declared
    # is not the same thing as something declared wrongly.
    if is_allow_listed_content_type(declared) and declared not in sniffed_content_types:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared type.",
        )

    # Never store the raw header regardless of which branch above was
    # taken: an accepted-but-generic declaration (or an accepted, correct
    # one) is stored as-is; anything else falls back to the format's own
    # canonical type, derived from the bytes rather than the caller.
    media_type = media_type_of(sniffed_content_types)
    content_type = declared if declared in sniffed_content_types else canonical_content_type(sniffed_content_types)
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
        # serialize_asset(duplicate) would otherwise turn this 409 into an
        # unhandled 500 at encode time. Encode here so callers reliably see
        # a 409 with the existing asset attached, not a 500.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This file is already in your workspace.",
                "existing": jsonable_encoder(serialize_asset(duplicate)),
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
        # gets the opposite treatment (an explicit 400, checked near the top
        # of this function) instead, because a title the user *did* type
        # deserves an honest rejection rather than a silent truncation.
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

    return serialize_asset(asset)


# ── Listing ──────────────────────────────────────────────────────────

SORT_FIELDS = {
    "created_at": MediaAsset.created_at,
    "filename": MediaAsset.filename,
    "title": MediaAsset.title,
    "size": MediaAsset.size_bytes,
    "type": MediaAsset.media_type,
}

MEDIA_TYPES = ("image", "video")
STATUSES = ("private", "submitted", "public")


@router.get("")
async def list_media(
    q: Optional[str] = Query(None, description="Match filename, title, description or tags"),
    type: Optional[str] = Query(None, description="image | video"),
    status: Optional[str] = Query(None, description="private | submitted | public"),
    tag: Optional[str] = Query(None, description="Exact tag match"),
    owner_id: Optional[str] = Query(None, description="Admin/manager only; accepts 'unassigned'"),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """List the caller's workspace, or every workspace for admins and managers."""
    if sort not in SORT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown sort field. Use one of: {', '.join(sorted(SORT_FIELDS))}",
        )
    if order not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="order must be 'asc' or 'desc'")

    query = db.query(MediaAsset)

    # Scope first, and structurally: a field-staff query can never widen.
    role = role_of(current_user)
    if role not in MANAGER_ROLES:
        query = query.filter(MediaAsset.owner_id == current_user.id)
    elif owner_id:
        if owner_id == "unassigned":
            query = query.filter(MediaAsset.owner_id.is_(None))
        else:
            try:
                owner_id_int = int(owner_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="owner_id must be an integer or 'unassigned'")
            # int() has no size limit, so an absurdly long digit string
            # parses fine here and the error only surfaces once the query
            # actually executes below -- OverflowError on SQLite, a driver
            # range error on PostgreSQL, either way an unhandled 500 where
            # this sibling (non-numeric) path gives a clean 400. owner_id is
            # a 32-bit Integer column; bounding against that range catches
            # it here instead of waiting for a specific driver to reject it
            # in a specific way.
            if not (-2_147_483_648 <= owner_id_int <= 2_147_483_647):
                raise HTTPException(status_code=400, detail="owner_id must be an integer or 'unassigned'")
            query = query.filter(MediaAsset.owner_id == owner_id_int)

    # Both helpers escape LIKE metacharacters and hand back the escape character
    # with the pattern — without it, q="%" or tag="%" matches every row, and a
    # trailing backslash behaves differently on PostgreSQL than on SQLite.
    if q:
        found = search_pattern(q)
        if found is not None:
            pattern, escape = found
            query = query.filter(MediaAsset.search_text.ilike(pattern, escape=escape))
    if tag:
        found = tag_filter_pattern(tag)
        if found is None:
            raise HTTPException(status_code=400, detail="tag must not be empty")
        pattern, escape = found
        query = query.filter(MediaAsset.search_text.ilike(pattern, escape=escape))
    if type:
        if type not in MEDIA_TYPES:
            raise HTTPException(status_code=400, detail="type must be 'image' or 'video'")
        query = query.filter(MediaAsset.media_type == type)
    if status:
        if status not in STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(STATUSES)}")
        query = query.filter(MediaAsset.status == status)

    total = query.count()

    column = SORT_FIELDS[sort]
    query = query.order_by(column.asc() if order == "asc" else column.desc())
    # Stable tiebreak so pagination cannot repeat or drop a row.
    query = query.order_by(None).order_by(
        column.asc() if order == "asc" else column.desc(), MediaAsset.id.asc()
    )

    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [serialize_asset(asset) for asset in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Workspaces summary (declare before /{asset_id}) ──────────────────

@router.get("/workspaces")
async def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Every staff member's workspace, plus Unassigned if it holds anything.

    Every staff account gets a row even when it holds nothing yet — a workspace
    exists because the person does, and an empty one still has to be selectable
    when a reviewer reassigns legacy media.
    """
    totals = {
        row.owner_id: row
        for row in db.query(
            MediaAsset.owner_id,
            func.count(MediaAsset.id).label("asset_count"),
            func.coalesce(func.sum(MediaAsset.size_bytes), 0).label("total_bytes"),
        ).group_by(MediaAsset.owner_id).all()
    }

    submitted = dict(
        db.query(MediaAsset.owner_id, func.count(MediaAsset.id))
        .filter(MediaAsset.status == "submitted")
        .group_by(MediaAsset.owner_id)
        .all()
    )

    staff = (
        db.query(User)
        .filter(User.role.in_(STAFF_ROLES))
        .all()
    )

    def _row(owner_id, name, email):
        total = totals.get(owner_id)
        return {
            "owner_id": owner_id,
            "owner_name": name,
            "owner_email": email,
            "asset_count": int(total.asset_count) if total else 0,
            "total_bytes": int(total.total_bytes) if total else 0,
            "submitted_count": int(submitted.get(owner_id, 0)),
        }

    workspaces = [_row(user.id, user.name or user.email, user.email) for user in staff]

    # Owners who are no longer staff, plus the owner-less legacy pool.
    known = {user.id for user in staff}
    for owner_id in totals:
        if owner_id is None:
            workspaces.append(_row(None, "Unassigned", None))
        elif owner_id not in known:
            owner = db.query(User).filter(User.id == owner_id).first()
            workspaces.append(_row(
                owner_id,
                (owner.name or owner.email) if owner else f"User {owner_id}",
                owner.email if owner else None,
            ))

    workspaces.sort(key=lambda w: (w["owner_id"] is None, -w["asset_count"], w["owner_name"]))
    return {"workspaces": workspaces}


# ── Detail and metadata ──────────────────────────────────────────────

class MediaAssetUpdate(BaseModel):
    # Not Field(None, max_length=200): see the identical note on upload's
    # manual title-length check above — a Pydantic max_length violation
    # 422s in FastAPI's own error shape, not the plain 400 every other
    # validation problem on this resource uses. Checked by hand below.
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list] = None


@router.get("/{asset_id}")
async def get_media_detail(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """One asset, plus where it is used across the public site."""
    asset = _load_asset(db, asset_id)
    _require_can_view(asset, current_user)

    usage = usage_for_asset(asset.id, db)
    payload = serialize_asset(asset)
    payload["usage"] = usage
    payload["usage_count"] = sum(len(v) for v in usage.values())
    return payload


@router.patch("/{asset_id}")
async def update_media_metadata(
    asset_id: int,
    payload: MediaAssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Edit title, description and tags. Status is deliberately not editable here."""
    asset = _load_asset(db, asset_id)
    _require_can_edit(asset, current_user)

    if payload.title is not None and len(payload.title) > 200:
        raise HTTPException(status_code=400, detail="Title is longer than 200 characters.")

    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields:
        asset.title = fields["title"] or None
    if "description" in fields:
        asset.description = fields["description"] or None
    if "tags" in fields:
        # Same write-path gate as upload: without validate_tags() here, PATCH
        # was the one path into this table that let a >MAX_TAGS list or a
        # tag containing TAG_DELIM through, silently rewritten (not
        # rejected) by normalize_tags — exactly what validate_tags' own
        # docstring says that split exists to prevent.
        problems = validate_tags(fields["tags"])
        if problems:
            raise HTTPException(status_code=400, detail={"tags": problems})
        asset.tags = normalize_tags(fields["tags"])

    asset.search_text = build_search_text(
        asset.filename, asset.title, asset.description, asset.tags
    )
    db.commit()
    db.refresh(asset)
    logger.info(
        "Media %s metadata updated by %s (role=%s)",
        asset.id, current_user.email, role_of(current_user),
    )
    return serialize_asset(asset)


class ReassignRequest(BaseModel):
    owner_id: Optional[int] = None


@router.post("/{asset_id}/reassign")
async def reassign_media(
    asset_id: int,
    payload: ReassignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Move an asset into another member's workspace.

    Chiefly for backfilled legacy media, which arrives owner-less. A null
    owner_id sends the asset back to the Unassigned workspace. Ownership is
    deliberately not part of PATCH: it is a privileged action, and keeping it on
    its own route keeps the privilege check out of the metadata path.

    Deliberately does not touch `status`: reassigning a public asset leaves
    it public. Reassignment moves who is responsible for an asset, not
    whether reviewers have already approved it for the site.
    """
    asset = _load_asset(db, asset_id)
    previous_owner_id = asset.owner_id

    if payload.owner_id is not None:
        owner = db.query(User).filter(User.id == payload.owner_id).first()
        if owner is None:
            raise HTTPException(status_code=404, detail="No such user")
        if role_of(owner) not in STAFF_ROLES:
            raise HTTPException(
                status_code=400, detail="Only staff accounts can own media."
            )
        # A deactivated account can never log in (get_current_user rejects it),
        # so media parked there is a silent dead end: not in the Unassigned pool,
        # and invisible to the one person nominally responsible for it.
        if not owner.is_active:
            raise HTTPException(
                status_code=400,
                detail="That account is deactivated. Reassign to an active member, "
                       "or leave the media unassigned.",
            )

    asset.owner_id = payload.owner_id
    db.commit()
    db.refresh(asset)
    logger.info(
        "Media %s reassigned from owner_id=%s to owner_id=%s by %s",
        asset.id, previous_owner_id, payload.owner_id, current_user.email,
    )
    return serialize_asset(asset)
