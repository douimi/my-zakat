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
from typing import Optional, Sequence

# Tags are stored inside `search_text` wrapped in this delimiter so an exact-tag
# filter is a plain ILIKE ('%|gaza|%') that behaves the same on PostgreSQL and
# on the SQLite used by the test suite.
TAG_DELIM = "|"

# The character LIKE/ILIKE uses to escape '%' and '_' inside a pattern so they
# match literally. tag_filter_pattern/search_pattern return this alongside
# their pattern as a (pattern, escape) pair specifically so a caller cannot
# call ilike(pattern) and drop it without a visibly incomplete unpacking.
LIKE_ESCAPE = "\\"

MAX_TAG_LENGTH = 64
MAX_TAGS = 25

# Extension -> accepted Content-Type aliases for it. This is the single source
# of truth: IMAGE_EXTENSIONS / VIDEO_EXTENSIONS / IMAGE_CONTENT_TYPES /
# VIDEO_CONTENT_TYPES are all derived from these two maps below, so adding a
# format means touching one place instead of remembering to keep four
# collections in sync.
#
# .ogg is conventionally Ogg *audio*, and .ogv is Ogg *video* — .ogg is kept
# mapped to video here for backward compatibility with existing data/callers.
# .jpg -> "image/jpg" is a non-standard alias some Android/older clients
# really send; .bmp -> "image/x-ms-bmp" is the same story for BMP.
_IMAGE_FORMATS: dict = {
    ".jpg": ("image/jpeg", "image/jpg"),
    ".jpeg": ("image/jpeg",),
    ".png": ("image/png",),
    ".gif": ("image/gif",),
    ".webp": ("image/webp",),
    ".bmp": ("image/bmp", "image/x-ms-bmp"),
}
_VIDEO_FORMATS: dict = {
    ".mp4": ("video/mp4",),
    ".webm": ("video/webm",),
    ".ogg": ("video/ogg",),
    ".ogv": ("video/ogg",),
    ".avi": ("video/x-msvideo",),
    ".mov": ("video/quicktime",),
    ".mkv": ("video/x-matroska",),
    # 3GP is what low-end Android phones produce — squarely our field-worker
    # population. It is ISO-BMFF, so Task 5's ftyp sniff already classifies it
    # as video and ffmpeg reads it.
    ".3gp": ("video/3gpp", "video/3gpp2"),
    ".m4v": ("video/x-m4v",),
}

# str.endswith() requires a tuple, not a set/frozenset — keep these as tuples.
# If someone "tidies" them into sets, detect_media_type's extension fallback
# breaks silently (TypeError at best, since endswith rejects a non-tuple).
IMAGE_EXTENSIONS: tuple = tuple(_IMAGE_FORMATS)
VIDEO_EXTENSIONS: tuple = tuple(_VIDEO_FORMATS)
_ALLOWED_EXTENSIONS = frozenset(IMAGE_EXTENSIONS + VIDEO_EXTENSIONS)

# Content-Type is an allow-list, not a deny-list: a deny-list must be matched
# exactly (it was, and "image/svg+xml; charset=utf-8" slipped past it), while
# an allow-list refuses anything unlisted by construction — including the next
# script-carrying format nobody has thought of yet. Task 5's upload router
# needs these too.
IMAGE_CONTENT_TYPES = frozenset(ct for cts in _IMAGE_FORMATS.values() for ct in cts)
VIDEO_CONTENT_TYPES = frozenset(ct for cts in _VIDEO_FORMATS.values() for ct in cts)

# Recognised formats we cannot decode yet. Named so the API can explain itself
# instead of returning a generic "unsupported file type" for an obvious photo
# — an iPhone in default "High Efficiency" mode sends HEIC. detect_media_type
# still returns None for every one of these; this is purely a better error
# message, not a classification change. Allow-listing HEIC as an image would
# be worse: HEIC is ISO-BMFF, so Task 5's ftyp sniffer would call it video.
UNSUPPORTED_HINTS = {
    "image/heic": "HEIC photos aren't supported yet. On iPhone: Settings → Camera → Formats → Most Compatible.",
    "image/heif": "HEIF photos aren't supported yet. On iPhone: Settings → Camera → Formats → Most Compatible.",
    "image/avif": "AVIF images aren't supported yet. Please upload a JPEG or PNG.",
    "image/tiff": "TIFF images aren't supported yet. Please upload a JPEG or PNG.",
}
_UNSUPPORTED_EXTENSIONS = {
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


def _escape_like(value: str) -> str:
    """Escape LIKE metacharacters so `value` matches only itself.

    Backslash first, or it would double-escape the escapes added after it.
    """
    for ch in (LIKE_ESCAPE, "%", "_"):
        value = value.replace(ch, LIKE_ESCAPE + ch)
    return value


def _truncate_for_message(value: str, limit: int = MAX_TAG_LENGTH + 10) -> str:
    """A length-capped, repr-quoted rendering of a value for an error message.

    Without this, an absurdly long input (a 100,000-character tag) lands
    unabridged in a 400 response body and whatever logs record it.
    """
    text = str(value)
    if len(text) > limit:
        text = text[:limit] + "..."
    return repr(text)


def normalize_tags(tags: Optional[Sequence]) -> list[str]:
    """Lowercase, strip and dedupe tags, preserving first-seen order.

    Takes a Sequence rather than a bare Iterable deliberately: validate_tags
    iterates the same input more than once, and a generator would be consumed
    by the first pass, leaving the second with nothing.

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


def validate_tags(tags: Optional[Sequence]) -> list[str]:
    """Return human-readable problems with caller-supplied tags, or [].

    normalize_tags stays lenient because it runs on both the write and the
    read path; this is the write-path gate — Task 5's router turns a non-empty
    result into a 400, so a user is told about a bad tag rather than having it
    silently rewritten.

    Validates the *normalized* form: surrounding whitespace, casing, and
    duplicate tags are not themselves errors, since normalize_tags quietly
    turns them into something valid (["gaza"] * 26 dedupes to one tag and
    must not be rejected as "too many"). A tag that is empty or only
    whitespace IS rejected here, even though it would just as quietly vanish
    in normalize_tags — that silent drop is exactly what this split exists to
    prevent.

    '%', '_' and '\\' are deliberately NOT rejected: _escape_like already
    neutralises them in tag_filter_pattern, so banning them would only
    discard legitimate tags ("50%-off", "water_well") for no security benefit.
    TAG_DELIM remains banned, because normalize_tags does not merely escape
    it — it changes the tag's identity (removes the character), which is
    worth telling the user about rather than silently rewriting.
    """
    if tags is None:
        return []
    tags = list(tags)
    problems: list[str] = []

    string_tags: list[str] = []
    for raw in tags:
        if not isinstance(raw, str):
            problems.append(f"Tag {_truncate_for_message(raw)} must be text.")
            continue
        string_tags.append(raw)

        candidate = raw.strip().lower()
        if not candidate:
            problems.append("A tag cannot be empty or made only of whitespace.")
            continue
        if TAG_DELIM in candidate:
            problems.append(
                f"Tag {_truncate_for_message(candidate)} may not contain "
                f"{TAG_DELIM!r} — it is used internally to separate tags."
            )
        if len(candidate) > MAX_TAG_LENGTH:
            problems.append(
                f"Tag {_truncate_for_message(candidate)} is longer than "
                f"{MAX_TAG_LENGTH} characters."
            )

    normalized_count = len(normalize_tags(string_tags))
    if normalized_count > MAX_TAGS:
        problems.append(
            f"No more than {MAX_TAGS} tags are allowed "
            f"(got {normalized_count} after removing duplicates)."
        )

    return problems


def build_search_text(
    filename: Optional[str],
    title: Optional[str],
    description: Optional[str],
    tags: Optional[Sequence],
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


def tag_filter_pattern(tag: Optional[str]) -> Optional[tuple]:
    """ILIKE pattern and required escape char matching one whole tag, or
    None if the tag is empty.

    Returns a (pattern, escape) pair — rather than a bare pattern — so a
    caller cannot drop the escape without a visibly incomplete unpacking:

        result = tag_filter_pattern(tag)
        if result is not None:
            pattern, escape = result
            query.filter(MediaAsset.search_text.ilike(pattern, escape=escape))

    The tag is escaped so '%', '_' and a literal backslash inside it match
    themselves rather than acting as LIKE wildcards — otherwise a tag like
    "gaz_" would also match "gaza", and a tag of exactly "%" would match every
    tagged asset.
    """
    normalized = normalize_tags([tag] if tag is not None else [])
    if not normalized:
        return None
    escaped = _escape_like(normalized[0])
    return f"%{TAG_DELIM}{escaped}{TAG_DELIM}%", LIKE_ESCAPE


def search_pattern(q: Optional[str]) -> Optional[tuple]:
    """ILIKE pattern and required escape char for a free-text query, or None
    if the query is empty.

    Exists so a free-text search never has to hand-roll its own pattern —
    `ilike(f"%{q}%")` with no escaping means a query of "%" matches every
    row. Same shape and the same obligation as tag_filter_pattern: unpack
    both and pass escape=LIKE_ESCAPE, or the escaping here has no effect.
    """
    if q is None:
        return None
    cleaned = q.strip().lower()
    if not cleaned:
        return None
    return f"%{_escape_like(cleaned)}%", LIKE_ESCAPE


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


def unsupported_hint(filename: Optional[str], content_type: Optional[str]) -> Optional[str]:
    """A specific explanation when we recognise the format but cannot take it.

    detect_media_type returns None for these formats exactly as it does for
    any other unsupported file — this only supplies a better message for the
    API to surface, telling an iPhone user why their HEIC photo bounced
    instead of leaving them with a generic "unsupported file type" for what
    is obviously a photo.
    """
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if ct in UNSUPPORTED_HINTS:
        return UNSUPPORTED_HINTS[ct]

    name = (filename or "").lower()
    for ext, mapped_ct in _UNSUPPORTED_EXTENSIONS.items():
        if name.endswith(ext):
            return UNSUPPORTED_HINTS[mapped_ct]
    return None


def _safe_extension(filename: Optional[str]) -> str:
    """The lowercased extension if it is one we store, else ''.

    Constrained to the image/video extension allow-list rather than merely
    well-formed: a well-formed but arbitrary extension (".html", ".exe",
    ".svg") would otherwise ride unchanged into the object key.
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
