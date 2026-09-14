"""Pure helpers for the media library.

No database and no S3 here on purpose — everything in this module is a plain
function over plain values, which keeps the security-relevant string handling
(object keys, search text) cheap to test.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime
from typing import Iterable, Optional

# Tags are stored inside `search_text` wrapped in this delimiter so an exact-tag
# filter is a plain ILIKE ('%|gaza|%') that behaves the same on PostgreSQL and
# on the SQLite used by the test suite.
TAG_DELIM = "|"

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".ogg", ".avi", ".mov", ".mkv")

# SVG is a script-carrying document format, not a photo. Excluded outright so a
# declared "image/svg+xml" cannot get one classified as an image.
REJECTED_CONTENT_TYPES = ("image/svg+xml",)

_SAFE_EXTENSION = re.compile(r"^\.[a-z0-9]{1,8}$")


def normalize_tags(tags: Optional[Iterable]) -> list:
    """Lowercase, strip and dedupe tags, preserving first-seen order.

    The delimiter is removed rather than escaped: tags are user-supplied labels,
    and a tag containing TAG_DELIM would otherwise match several exact-tag
    filters at once (["gaza|evil"] would answer to both tag=gaza and tag=evil).
    """
    result: list = []
    for raw in tags or []:
        tag = str(raw).replace(TAG_DELIM, " ").strip().lower()
        if tag and tag not in result:
            result.append(tag)
    return result


def build_search_text(
    filename: Optional[str],
    title: Optional[str],
    description: Optional[str],
    tags: Optional[Iterable],
) -> str:
    """Build the lowercased haystack a single ILIKE searches against."""
    parts = [
        (filename or "").lower(),
        (title or "").lower(),
        (description or "").lower(),
    ]
    normalized = normalize_tags(tags)
    if normalized:
        parts.append(TAG_DELIM + TAG_DELIM.join(normalized) + TAG_DELIM)
    return " ".join(part for part in parts if part)


def tag_filter_pattern(tag: Optional[str]) -> Optional[str]:
    """ILIKE pattern matching one whole tag, or None if the tag is empty."""
    normalized = normalize_tags([tag] if tag is not None else [])
    if not normalized:
        return None
    return f"%{TAG_DELIM}{normalized[0]}{TAG_DELIM}%"


def detect_media_type(filename: Optional[str], content_type: Optional[str]) -> Optional[str]:
    """Return 'image', 'video', or None for anything we refuse to store."""
    ct = (content_type or "").lower()
    if ct in REJECTED_CONTENT_TYPES:
        return None
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("video/"):
        return "video"

    name = (filename or "").lower()
    if name.endswith(IMAGE_EXTENSIONS):
        return "image"
    if name.endswith(VIDEO_EXTENSIONS):
        return "video"
    return None


def _safe_extension(filename: Optional[str]) -> str:
    """The lowercased extension, or '' if it is missing or suspicious."""
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if _SAFE_EXTENSION.match(ext) else ""


def build_object_key(owner_id: int, filename: Optional[str], now: Optional[datetime] = None) -> str:
    """Namespaced, dated, random object key.

    The uploaded filename never reaches the key — a UUID replaces it — which
    removes both collisions and path traversal. The original name is kept in the
    `filename` column, where it stays searchable.
    """
    # Interpolated straight into the key, so a non-integer owner could escape its
    # own namespace ("7/../../other-owner"). Callers pass an authenticated user's
    # id; this makes that a guarantee rather than an assumption.
    if isinstance(owner_id, bool) or not isinstance(owner_id, int) or owner_id <= 0:
        raise ValueError(f"owner_id must be a positive integer, got {owner_id!r}")
    moment = now or datetime.utcnow()
    return (
        f"workspaces/{owner_id}/{moment:%Y}/{moment:%m}/"
        f"{uuid.uuid4().hex}{_safe_extension(filename)}"
    )


def build_thumbnail_key(object_key: str) -> str:
    """Thumbnail key sitting beside the object it belongs to."""
    directory, _, basename = object_key.rpartition("/")
    stem = basename.rsplit(".", 1)[0] if "." in basename else basename
    prefix = f"{directory}/" if directory else ""
    return f"{prefix}{stem}_thumb.jpg"
