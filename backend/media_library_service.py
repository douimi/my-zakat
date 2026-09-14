"""Pure helpers for the media library.

No database and no S3 here on purpose — everything in this module is a plain
function over plain values, which keeps the security-relevant string handling
(object keys, search text) cheap to test.

The recurring theme in this module is untrusted text reaching a context where
it has syntactic meaning: a tag containing the tag delimiter, a LIKE pattern
containing a LIKE wildcard, a Content-Type header containing a parameter, an
uploaded filename containing an executable extension. Every helper below
either neutralises that meaning or refuses the input outright.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional

# Tags are stored inside `search_text` wrapped in this delimiter so an exact-tag
# filter is a plain ILIKE ('%|gaza|%') that behaves the same on PostgreSQL and
# on the SQLite used by the test suite.
TAG_DELIM = "|"

# The character LIKE/ILIKE uses to escape '%' and '_' inside a pattern so they
# match literally. Callers of tag_filter_pattern's result MUST pass
# escape=LIKE_ESCAPE to ilike()/like(), or the escaping below is inert.
LIKE_ESCAPE = "\\"

MAX_TAG_LENGTH = 64
MAX_TAGS = 25

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".ogg", ".avi", ".mov", ".mkv")
_ALLOWED_EXTENSIONS = frozenset(IMAGE_EXTENSIONS + VIDEO_EXTENSIONS)

# Content-Type is an allow-list, not a deny-list: a deny-list must be matched
# exactly (it was, and "image/svg+xml; charset=utf-8" slipped past it), while
# an allow-list refuses anything unlisted by construction — including the next
# script-carrying format nobody has thought of yet. Task 5's upload router
# needs these too.
IMAGE_CONTENT_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
})
VIDEO_CONTENT_TYPES = frozenset({
    "video/mp4", "video/webm", "video/ogg", "video/x-msvideo",
    "video/quicktime", "video/x-matroska",
})


def _escape_like(value: str) -> str:
    """Escape LIKE metacharacters so `value` matches only itself.

    Backslash first, or it would double-escape the escapes added after it.
    """
    for ch in (LIKE_ESCAPE, "%", "_"):
        value = value.replace(ch, LIKE_ESCAPE + ch)
    return value


def normalize_tags(tags: Optional[Iterable]) -> list[str]:
    """Lowercase, strip and dedupe tags, preserving first-seen order.

    Deliberately total and lenient: this runs on both the write path (before
    a tag is stored) and the read path (before a tag is used as a filter), so
    it never raises — a bad tag on the write path is a validate_tags problem,
    not a normalize_tags one. Non-string entries are skipped rather than
    coerced with str(), so a stray {"tags": [null]} in a JSON body cannot
    silently create a tag named "none".

    The tag delimiter is removed rather than escaped: a tag containing
    TAG_DELIM would otherwise match several exact-tag filters at once
    (["gaza|evil"] would answer to both tag=gaza and tag=evil).
    """
    result: list[str] = []
    for raw in tags or []:
        if not isinstance(raw, str):
            continue
        tag = raw.replace(TAG_DELIM, " ").strip().lower()
        if tag and tag not in result:
            result.append(tag)
    return result


def validate_tags(tags: Optional[Iterable]) -> list[str]:
    """Return human-readable problems with caller-supplied tags, or [].

    normalize_tags stays lenient because it runs on both the write and the
    read path; this is the write-path gate — Task 5's router turns a non-empty
    result into a 400, so a user is told about a bad tag rather than having it
    silently rewritten.
    """
    if tags is None:
        return []
    tags = list(tags)
    problems: list[str] = []

    if len(tags) > MAX_TAGS:
        problems.append(f"No more than {MAX_TAGS} tags are allowed (got {len(tags)}).")

    for raw in tags:
        if not isinstance(raw, str):
            problems.append(f"Tag {raw!r} must be text.")
            continue
        if len(raw) > MAX_TAG_LENGTH:
            problems.append(f"Tag {raw!r} is longer than {MAX_TAG_LENGTH} characters.")
        bad_chars = [ch for ch in (TAG_DELIM, "%", "_", LIKE_ESCAPE) if ch in raw]
        if bad_chars:
            problems.append(f"Tag {raw!r} may not contain {''.join(bad_chars)!r}.")

    return problems


def build_search_text(
    filename: Optional[str],
    title: Optional[str],
    description: Optional[str],
    tags: Optional[Iterable],
) -> str:
    """Build the lowercased haystack a single ILIKE searches against.

    The tag delimiter is stripped from the free-text fields too, not just from
    tags: filename, title and description are all user-supplied (a pipe is a
    legal filename character on Linux and macOS), and any of them could
    otherwise inject a delimiter pair that a tag_filter_pattern would match
    against by accident.
    """
    parts = [
        (filename or "").replace(TAG_DELIM, " ").lower(),
        (title or "").replace(TAG_DELIM, " ").lower(),
        (description or "").replace(TAG_DELIM, " ").lower(),
    ]
    normalized = normalize_tags(tags)
    if normalized:
        parts.append(TAG_DELIM + TAG_DELIM.join(normalized) + TAG_DELIM)
    return " ".join(part for part in parts if part)


def tag_filter_pattern(tag: Optional[str]) -> Optional[str]:
    """ILIKE pattern matching one whole tag, or None if the tag is empty.

    The tag is escaped so '%', '_' and a literal backslash inside it match
    themselves rather than acting as LIKE wildcards — otherwise a tag like
    "gaz_" would also match "gaza", and a tag of exactly "%" would match every
    tagged asset. Callers MUST pass escape=LIKE_ESCAPE to the ilike()/like()
    call this pattern feeds, or the escaping here has no effect.
    """
    normalized = normalize_tags([tag] if tag is not None else [])
    if not normalized:
        return None
    escaped = _escape_like(normalized[0])
    return f"%{TAG_DELIM}{escaped}{TAG_DELIM}%"


def detect_media_type(filename: Optional[str], content_type: Optional[str]) -> Optional[str]:
    """Classify a file as 'image', 'video', or neither.

    This is advisory, not a storage verdict: the result is derived from a
    caller-supplied filename and a Content-Type header the uploader fully
    controls (and can trivially spoof), not from the file's actual bytes. A
    caller holding the bytes must verify them independently before trusting
    this classification for anything security-relevant — Task 5's upload
    endpoint does that with a magic-byte check; this function stays pure.
    """
    # UploadFile.content_type carries parameters ("image/png; charset=utf-8"),
    # so match on the bare type. SVG (and anything else script-carrying) is
    # simply absent from the allow-list rather than named in a deny-list.
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if ct in IMAGE_CONTENT_TYPES:
        return "image"
    if ct in VIDEO_CONTENT_TYPES:
        return "video"

    name = (filename or "").lower()
    if name.endswith(IMAGE_EXTENSIONS):
        return "image"
    if name.endswith(VIDEO_EXTENSIONS):
        return "video"
    return None


def _safe_extension(filename: Optional[str]) -> str:
    """The lowercased extension if it is one we store, else ''.

    Constrained to the image/video allow-list rather than merely well-formed:
    a well-formed but arbitrary extension (".html", ".exe", ".svg") would
    otherwise ride unchanged into the object key.
    """
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if ext in _ALLOWED_EXTENSIONS else ""


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
    moment = now or datetime.now(timezone.utc)
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
