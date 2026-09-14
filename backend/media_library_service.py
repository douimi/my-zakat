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
from typing import TYPE_CHECKING, Callable, NamedTuple, Optional, Sequence

if TYPE_CHECKING:
    # Only for the type hint on serialize_asset() below — this module stays
    # database-free at runtime, per the module docstring.
    from models import MediaAsset

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

# Leading-bytes tests for the formats we accept. Each takes the *whole*
# uploaded buffer (not just a fixed-size prefix) because a couple of them
# need to look past the first four bytes — ISO-BMFF's 'ftyp' box sits at
# offset 4, RIFF's sub-type tag sits at offset 8 — and slicing a short
# `bytes` out of range in Python just yields a short (possibly empty)
# result rather than raising, so these stay safe on tiny/truncated input.
def _is_jpeg(content: bytes) -> bool:
    return content.startswith(b"\xff\xd8\xff")


def _is_png(content: bytes) -> bool:
    return content.startswith(b"\x89PNG\r\n\x1a\n")


def _is_gif(content: bytes) -> bool:
    return content.startswith((b"GIF87a", b"GIF89a"))


def _is_bmp(content: bytes) -> bool:
    return content.startswith(b"BM")


def _is_webp(content: bytes) -> bool:
    return content[:4] == b"RIFF" and content[8:12] == b"WEBP"


def _is_avi(content: bytes) -> bool:
    return content[:4] == b"RIFF" and content[8:12] == b"AVI "


def _is_ogg(content: bytes) -> bool:
    return content.startswith(b"OggS")


def _is_isobmff(content: bytes) -> bool:
    # ISO base media (mp4/mov/m4v/3gp) puts an 'ftyp' box at offset 4. This
    # cannot tell those apart from each other by brand, nor from HEIC/HEIF
    # (which use the same box) — a caller needing that distinction has to
    # inspect the brand itself. detect_media_type() keeps HEIC out of the
    # image allow-list entirely (see UNSUPPORTED_HINTS), so it never reaches
    # this sniffer with a video-shaped Content-Type to slip past.
    return content[4:8] == b"ftyp"


def _is_ebml(content: bytes) -> bool:
    # WebM is formally a Matroska profile, so the same EBML signature at
    # offset 0 covers both .webm and .mkv.
    return content[:4] == b"\x1a\x45\xdf\xa3"


class _Format(NamedTuple):
    content_types: tuple
    sniff: Callable[[bytes], bool]


# Extension -> (accepted Content-Type aliases, byte-signature test). This is
# the single source of truth: IMAGE_EXTENSIONS / VIDEO_EXTENSIONS /
# IMAGE_CONTENT_TYPES / VIDEO_CONTENT_TYPES / sniff_content_type() are all
# derived from these two maps below, so adding a format means touching one
# place instead of remembering to keep several collections in sync. This
# used to be true of only the first four; a `_MAGIC` table of leading bytes
# lived separately in the upload router and had already drifted from this
# allow-list by the first commit that had both — AVI and Ogg were accepted
# Content-Types the router's sniffer could not recognise, so a legitimate
# upload of either was told its content was a forgery. Folding the magic
# bytes in here as a third derived collection closes that by construction:
# a format cannot be in the allow-list without also being sniffable.
#
# .ogg is conventionally Ogg *audio*, and .ogv is Ogg *video* — .ogg is kept
# mapped to video here for backward compatibility with existing data/callers.
# .jpg -> "image/jpg" is a non-standard alias some Android/older clients
# really send; .bmp -> "image/x-ms-bmp" is the same story for BMP.
_IMAGE_FORMATS: dict = {
    ".jpg": _Format(("image/jpeg", "image/jpg"), _is_jpeg),
    ".jpeg": _Format(("image/jpeg",), _is_jpeg),
    ".png": _Format(("image/png",), _is_png),
    ".gif": _Format(("image/gif",), _is_gif),
    ".webp": _Format(("image/webp",), _is_webp),
    ".bmp": _Format(("image/bmp", "image/x-ms-bmp"), _is_bmp),
}
_VIDEO_FORMATS: dict = {
    ".mp4": _Format(("video/mp4",), _is_isobmff),
    ".webm": _Format(("video/webm",), _is_ebml),
    ".ogg": _Format(("video/ogg",), _is_ogg),
    ".ogv": _Format(("video/ogg",), _is_ogg),
    ".avi": _Format(("video/x-msvideo",), _is_avi),
    ".mov": _Format(("video/quicktime",), _is_isobmff),
    ".mkv": _Format(("video/x-matroska",), _is_ebml),
    # 3GP is what low-end Android phones produce — squarely our field-worker
    # population. It is ISO-BMFF, so Task 5's ftyp sniff already classifies it
    # as video and ffmpeg reads it.
    ".3gp": _Format(("video/3gpp", "video/3gpp2"), _is_isobmff),
    ".m4v": _Format(("video/x-m4v",), _is_isobmff),
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
IMAGE_CONTENT_TYPES = frozenset(ct for fmt in _IMAGE_FORMATS.values() for ct in fmt.content_types)
VIDEO_CONTENT_TYPES = frozenset(ct for fmt in _VIDEO_FORMATS.values() for ct in fmt.content_types)


def _sniff_rules(formats: dict) -> tuple:
    """(matcher, canonical content-type, content-type aliases) triples, one
    per distinct byte test.

    Several extensions share one matcher — .jpg/.jpeg both sniff as JPEG,
    .ogg/.ogv both sniff as Ogg, .webm/.mkv both sniff as EBML, and every
    ISO-BMFF extension (.mp4/.mov/.m4v/.3gp) sniffs identically — so this
    groups by the matcher function itself and unions the content-type
    aliases of every extension that shares it, rather than testing the same
    bytes twice for what is, at the byte level, one format. `canonical` is
    the first content-type of the first-seen extension in that group (dicts
    preserve insertion order, so this is deterministic): for the ISO-BMFF
    group that is ".mp4"'s "video/mp4", not ".3gp"'s or ".mov"'s, because
    .mp4 is declared first in _VIDEO_FORMATS.
    """
    grouped: dict = {}
    order: list = []
    for fmt in formats.values():
        if fmt.sniff not in grouped:
            grouped[fmt.sniff] = {"canonical": fmt.content_types[0], "aliases": set()}
            order.append(fmt.sniff)
        grouped[fmt.sniff]["aliases"].update(fmt.content_types)
    return tuple(
        (matcher, grouped[matcher]["canonical"], frozenset(grouped[matcher]["aliases"]))
        for matcher in order
    )


# Image rules before video rules purely so a mixed-format false-positive
# (none known today) would resolve toward "image" first; sniff_content_type
# returns on the first match either way.
_SNIFF_RULES = _sniff_rules(_IMAGE_FORMATS) + _sniff_rules(_VIDEO_FORMATS)

# frozenset(aliases) -> canonical, for canonical_content_type(). Built once
# from the same rules sniff_content_type() matches against, so the two can
# never drift relative to each other.
_CANONICAL_BY_ALIASES = {aliases: canonical for _, canonical, aliases in _SNIFF_RULES}


def sniff_content_type(content: bytes) -> Optional[frozenset]:
    """The Content-Type aliases the file's own leading bytes are consistent
    with, or None if they match no format this module recognises.

    This is the byte-level counterpart to detect_media_type(): that function
    trusts a caller-supplied filename/Content-Type, this one trusts nothing
    but the bytes themselves. The upload router requires an *allow-listed*
    declared Content-Type to be a member of the returned set — not merely of
    the right broad image/video category — which is what closes a spoofed
    "declare image/gif over real JPEG bytes" upload: image/gif is a
    perfectly valid Content-Type in general, just never a member of the set
    JPEG bytes sniff to, so the mismatch is caught here regardless of what
    should_compress_image() would have done with the (wrong) declared type.
    A declared type that is *not* allow-listed at all (a generic default
    like application/octet-stream, or no header) is not this kind of
    mismatch — see is_allow_listed_content_type() and canonical_content_type().
    """
    for matcher, _canonical, content_types in _SNIFF_RULES:
        if matcher(content):
            return content_types
    return None


def canonical_content_type(content_types) -> str:
    """The single Content-Type to store for a set sniff_content_type()
    returned.

    A frozenset has no defined order, so picking a member directly
    (`next(iter(...))`) is not deterministic across interpreters/runs. This
    looks the exact set back up against the format tables instead, which
    were built in a fixed, declared order — the same aliases always
    canonicalise to the same stored Content-Type.
    """
    canonical = _CANONICAL_BY_ALIASES.get(frozenset(content_types))
    if canonical is not None:
        return canonical
    # Defensive only: every real caller passes this the exact return value
    # of sniff_content_type(), which is always a key of the dict above, so
    # this should be unreachable. Still deterministic if it is ever hit.
    return sorted(content_types)[0]


def is_allow_listed_content_type(value: Optional[str]) -> bool:
    """Whether `value` is a Content-Type this module lists for some format —
    image or video.

    Used to tell "the caller declared a real, specific Content-Type that
    turned out wrong" (evidence of a spoof) apart from "the caller declared
    nothing meaningful" (a generic default like application/octet-stream —
    what curl and some mobile webviews send with no OS MIME mapping to
    consult — or a missing header entirely). Only the former is a claim
    worth rejecting on mismatch; the latter should fall back to whatever the
    bytes actually are.
    """
    return value in IMAGE_CONTENT_TYPES or value in VIDEO_CONTENT_TYPES


def media_type_of(content_types) -> str:
    """'image' or 'video' for a set of Content-Type aliases such as
    sniff_content_type() returns.

    IMAGE_CONTENT_TYPES and VIDEO_CONTENT_TYPES are disjoint by
    construction (every format map entry contributes to exactly one of
    them), so membership in either is decisive.
    """
    return "image" if content_types & IMAGE_CONTENT_TYPES else "video"

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


def parse_tag_input(raw: Optional[str]) -> list[str]:
    """Split a comma-separated tag string into entries worth validating.

    Blank entries are dropped here rather than rejected downstream: "" and a
    trailing comma mean "no tags", not "an empty tag" -- a naive
    "".split(",") is [""], and a tagless upload (the common case) must not
    fail validate_tags' whitespace-only check. Entries are returned
    unmodified otherwise (not stripped or lowercased) -- validation and
    normalization stay separate steps -- so validate_tags then only ever
    sees things the user actually typed.
    """
    if not raw:
        return []
    return [part for part in raw.split(",") if part.strip()]


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
            # repr(raw) directly, not _truncate_for_message(raw): the latter
            # does repr(str(raw)), which would render None as 'none' -- the
            # exact stringification normalize_tags deliberately avoids -- and
            # makes "Tag '5' must be text." read as if the string "5" (which
            # *is* text) were the problem, rather than the int 5.
            problems.append(f"Tag {raw!r} must be text.")
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

    _UNSUPPORTED_EXTENSIONS and UNSUPPORTED_HINTS are hand-maintained in
    parallel with nothing enforcing the link between them, so both lookups
    use .get() rather than indexing: a future extension entry added without
    its hint text degrades to "no hint" instead of a 500 on the upload path.
    """
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    hint = UNSUPPORTED_HINTS.get(ct)
    if hint is not None:
        return hint

    name = (filename or "").lower()
    for ext, mapped_ct in _UNSUPPORTED_EXTENSIONS.items():
        if name.endswith(ext):
            return UNSUPPORTED_HINTS.get(mapped_ct)
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


def asset_file_url(asset_id: int) -> str:
    """The public path an asset's bytes are served from.

    The one place this string is written. routers/s3_media.py's
    get_media_usage() matches a published asset's presence in Gallery/Story/
    etc. columns by exact string equality against this value — a second,
    independently-typed spelling anywhere else would silently make that
    in-use check (and the delete/unpublish guards built on it) report zero
    usage for a genuinely-in-use asset, with nothing raising to say so.
    """
    return f"/api/media-library/{asset_id}/file"


def serialize_asset(asset: "MediaAsset") -> dict:
    """MediaAsset row -> the plain dict every media-library endpoint returns.

    Pure in the same sense as the rest of this module: reads attributes off
    an already-loaded ORM instance, issues no query and touches no Session.
    """
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
        "url": asset_file_url(asset.id),
        "thumbnail_url": f"/api/media-library/{asset.id}/thumb" if has_thumbnail else None,
    }
