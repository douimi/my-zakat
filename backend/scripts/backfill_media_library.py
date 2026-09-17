"""One-time import of pre-existing S3 objects into media_assets.

Everything already in the bucket predates workspaces, so it lands owner-less
(the "Unassigned" workspace) and already public — it is on the live site today.
An admin can reassign an asset to a member afterwards.

Idempotent: keyed on object_key, so re-running only adds what is missing.

Object keys are imported UNCHANGED — never rewritten to the
"workspaces/{owner_id}/..." form new uploads get. routers/media_library.py's
usage_for_asset() decides which spelling of a URL to check against the
content tables (GalleryItem, Story, ...) by whether object_key starts with
"workspaces/": a legacy key means the row may also be referenced by the
proxy URL get_file_url() produces, and both spellings get checked. If this
script ever normalised legacy keys into "workspaces/..." form, that guard
would stop asking the legacy spelling for exactly the rows most likely to
already be serving bytes to the public site — deleting one would remove
bytes the live site is still using, with nothing failing to say so.

    docker compose exec backend python -m scripts.backfill_media_library
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from database import SessionLocal
from logging_config import get_logger
from media_library_service import build_search_text, detect_media_type
from models import MediaAsset
from s3_service import list_files

logger = get_logger(__name__)

PREFIXES = ("images/", "videos/")


def _is_generated_thumbnail(filename: str) -> bool:
    """Thumbnails are derived files, not assets — /browse skips them the same way."""
    return "_thumb" in filename.lower()


def backfill(db: Session) -> int:
    """Insert a row for every S3 object that does not have one. Returns the count."""
    existing = {key for (key,) in db.query(MediaAsset.object_key).all()}
    created = 0

    for prefix in PREFIXES:
        for file_info in list_files(prefix):
            object_key = file_info["key"]
            if object_key in existing or object_key.endswith("/"):
                continue

            filename = object_key.split("/")[-1]
            if not filename or _is_generated_thumbnail(filename):
                continue

            media_type = detect_media_type(filename, None)
            if media_type is None:
                # Includes any .svg already in the bucket: SVG was dropped from the
                # allowed types as a script-carrying document format. Read whatever
                # this logs before treating the backfill as complete.
                logger.info("Skipping unsupported object %s", object_key)
                continue

            db.add(MediaAsset(
                owner_id=None,
                object_key=object_key,
                filename=filename,
                media_type=media_type,
                content_type="image/jpeg" if media_type == "image" else "video/mp4",
                size_bytes=file_info.get("size") or 0,
                search_text=build_search_text(filename, None, None, None),
                status="public",
            ))
            existing.add(object_key)
            created += 1

    db.commit()
    return created


def main() -> None:
    db = SessionLocal()
    try:
        created = backfill(db)
        logger.info("Backfill complete: %s asset(s) imported", created)
        print(f"Backfill complete: {created} asset(s) imported")
    finally:
        db.close()


if __name__ == "__main__":
    main()
