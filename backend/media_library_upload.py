"""Upload processing pipeline for the media library: the part of the upload
endpoint that touches bytes, Pillow, ffmpeg and S3.

Deliberately NOT part of media_library_service.py -- that module is pure by
design (its own docstring says so: no database, no S3, no Pillow) so its
string/allow-list handling stays cheap to test. Everything here does real
I/O (image/video processing, network writes to S3), so it gets its own home
instead of compromising that module's one invariant.

The two functions below are meant to be called in sequence, with the
caller's own duplicate-checksum DB query and row insert sandwiched between
them -- see routers/media_library.py's upload_media():

    processed = process_upload_bytes(declared_content_type, content)   # no I/O but Pillow/ffmpeg
    ... duplicate-checksum query against processed.checksum ...
    ... object_key = build_object_key(...) ...
    thumbnail_key = store_processed_upload(processed, object_key)      # S3 writes
    ... db.add/commit the row; on failure, cleanup_upload_artifacts(...) ...

Splitting it there, rather than doing the S3 writes inside
process_upload_bytes, is deliberate: a byte-identical re-upload must be
caught by the duplicate check *before* anything is written to S3, or a
rejected duplicate would leave an orphan object with no row ever intended to
point at it -- the same "recoverable orphan vs. unrecoverable dangling row"
reasoning that motivates the S3-first-row-second order below.

Every Pillow/ffmpeg/S3 hook below is an injectable keyword parameter,
defaulting to the real implementation, so a caller can substitute a fake for
direct testing without any HTTP round trip or monkeypatching -- see
tests/test_media_library_upload.py.
"""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from typing import Callable, Optional

from logging_config import get_logger
from media_library_service import (
    build_thumbnail_key,
    canonical_content_type,
    is_allow_listed_content_type,
    media_type_of,
    sniff_content_type,
)
from media_processing import (
    compress_image,
    compress_video,
    generate_video_thumbnail,
    should_compress_image,
    should_compress_video,
    strip_image_metadata,
)
from s3_service import delete_file, upload_file

logger = get_logger(__name__)


class ContentTypeMismatch(Exception):
    """The uploaded bytes don't match any supported format, or contradict an
    allow-listed declared Content-Type.

    Deliberately not an HTTPException: this module raises plain Python
    exceptions and leaves translating them into an HTTP response to the
    router, the same way the router -- not this module -- owns the
    duplicate-checksum 409 and the insert-failure 500.
    """


def _default_image_dimensions(data: bytes) -> tuple:
    """(width, height) for image bytes, or (None, None) if unreadable."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except Exception:
        return (None, None)


@dataclass
class ProcessedUpload:
    """Everything process_upload_bytes() decided about one upload's final,
    stored bytes -- the fields upload_media() needs to build a MediaAsset
    row plus the raw content store_processed_upload() writes to S3."""

    media_type: str
    content: bytes
    content_type: str
    width: Optional[int]
    height: Optional[int]
    thumbnail_bytes: Optional[bytes]
    checksum: str


def process_upload_bytes(
    declared_content_type: Optional[str],
    content: bytes,
    *,
    should_compress_image_fn: Callable[[str], bool] = should_compress_image,
    should_compress_video_fn: Callable[[str], bool] = should_compress_video,
    compress_image_fn: Callable[[bytes], bytes] = compress_image,
    compress_video_fn: Callable[[bytes], bytes] = compress_video,
    strip_image_metadata_fn: Callable[[bytes], bytes] = strip_image_metadata,
    generate_video_thumbnail_fn: Callable[[bytes], Optional[bytes]] = generate_video_thumbnail,
    image_dimensions_fn: Callable[[bytes], tuple] = _default_image_dimensions,
) -> ProcessedUpload:
    """Sniff, compress, strip and checksum one upload's bytes.

    Raises ContentTypeMismatch if the bytes match no supported format, or
    contradict a declared, allow-listed Content-Type -- the caller should
    treat that as a 400, same message either way ("File content does not
    match its declared type."), same as the pre-extraction router did.

    Does no I/O of its own beyond Pillow/ffmpeg (both pure computation over
    the bytes already in hand) -- no S3, no database. See the module
    docstring for why S3 writes are a separate step (store_processed_upload)
    the caller runs only after its own duplicate-checksum check passes.

    Order matters and is fixed by the caller-facing contract this module
    exists to protect:
      1. Sniff before compress -- the declared Content-Type is
         attacker-controlled; the bytes are checked before Pillow or ffmpeg
         ever see them.
      2. The stored Content-Type always comes from the allow-list or the
         format's own canonical type, never the raw header -- a GIF
         declared "text/html" must never become the stored type.
      3. EXIF/GPS stripping runs on every image, unconditionally -- not
         gated on should_compress_image_fn(), which is exactly what a
         spoofed declared type would use to dodge it if stripping depended
         on that gate (image/gif always skips compression, to protect
         animation).
      4. Orientation is applied (inside strip_image_metadata_fn) before the
         EXIF block that encodes it is discarded, or a portrait phone photo
         comes back out sideways.
    """
    # The bytes have to say what they are before anything reaches Pillow or
    # ffmpeg -- sniff_content_type() returns every Content-Type alias the
    # bytes are consistent with, or None if they match no format this module
    # recognises at all (a forged/corrupt/unsupported upload).
    declared = (declared_content_type or "").split(";", 1)[0].strip().lower()
    sniffed_content_types = sniff_content_type(content)
    if sniffed_content_types is None:
        raise ContentTypeMismatch("File content does not match its declared type.")

    # A declared type that IS allow-listed but ISN'T consistent with the
    # sniffed bytes is the spoof this check exists to catch (image/gif -- a
    # format should_compress_image_fn() always skips, and so never gets
    # re-encoded -- declared over real JPEG bytes, to dodge the metadata
    # stripping below). A declared type that is missing, or a generic
    # default like application/octet-stream (what curl -F and some mobile
    # webviews send with no OS MIME mapping to consult), is not a claim at
    # all, so there is nothing to contradict.
    if is_allow_listed_content_type(declared) and declared not in sniffed_content_types:
        raise ContentTypeMismatch("File content does not match its declared type.")

    # Never store the raw header regardless of which branch above was
    # taken: an accepted-but-generic declaration (or an accepted, correct
    # one) is stored as-is; anything else falls back to the format's own
    # canonical type, derived from the bytes rather than the caller.
    media_type = media_type_of(sniffed_content_types)
    content_type = declared if declared in sniffed_content_types else canonical_content_type(sniffed_content_types)
    width = height = None
    thumbnail_bytes = None

    if media_type == "image":
        if should_compress_image_fn(content_type):
            compressed = compress_image_fn(content)
            # compress_image_fn() returns the original object, unchanged, if
            # Pillow couldn't process it -- relabel only when it actually
            # produced new (JPEG) bytes, or a PNG Pillow chokes on would be
            # stored as PNG bytes wearing an image/jpeg label.
            if compressed is not content:
                content, content_type = compressed, "image/jpeg"
        # GPS/EXIF must never reach the public site. Unconditional -- not
        # gated on should_compress_image_fn() -- see the docstring above.
        stripped = strip_image_metadata_fn(content)
        if stripped is not content:
            content = stripped
        width, height = image_dimensions_fn(content)
    else:
        if should_compress_video_fn(content_type):
            content = compress_video_fn(content)
            # Symmetric with the image branch above: compress_video_fn()
            # transcodes into H.264/MP4 regardless of the source container,
            # so a 3GP upload stored under its original video/3gpp label
            # would be MP4 bytes wearing a Content-Type nothing plays.
            content_type = "video/mp4"
        thumbnail_bytes = generate_video_thumbnail_fn(content)

    checksum = hashlib.sha256(content).hexdigest()

    return ProcessedUpload(
        media_type=media_type,
        content=content,
        content_type=content_type,
        width=width,
        height=height,
        thumbnail_bytes=thumbnail_bytes,
        checksum=checksum,
    )


def store_processed_upload(
    processed: ProcessedUpload,
    object_key: str,
    *,
    upload_file_fn: Callable[..., str] = upload_file,
    build_thumbnail_key_fn: Callable[[str], str] = build_thumbnail_key,
) -> Optional[str]:
    """Write the processed object -- and its thumbnail, if any -- to S3.

    Returns the thumbnail's object key, or None if there is no thumbnail or
    its upload failed. The caller must not insert the MediaAsset row until
    after this returns: S3 first, row second, because an orphan S3 object is
    recoverable and a row pointing at nothing is not.

    The main object's upload is deliberately not caught here -- if it
    raises, the caller sees the exception uncaught, same as before this was
    extracted. Only the thumbnail is best-effort: a failed thumbnail must
    not fail the whole upload, so its exception is logged and swallowed.
    """
    upload_file_fn(processed.content, object_key, content_type=processed.content_type)

    thumbnail_key = None
    if processed.thumbnail_bytes:
        thumbnail_key = build_thumbnail_key_fn(object_key)
        try:
            upload_file_fn(processed.thumbnail_bytes, thumbnail_key, content_type="image/jpeg")
        except Exception as exc:
            logger.warning("Thumbnail upload failed for %s: %s", object_key, exc)
            thumbnail_key = None
    return thumbnail_key


def cleanup_upload_artifacts(
    object_key: str,
    thumbnail_key: Optional[str],
    *,
    delete_file_fn: Callable[..., bool] = delete_file,
) -> None:
    """Best-effort compensating delete for objects store_processed_upload()
    wrote, when the row meant to point at them never landed.

    delete_file_fn returns False rather than raising on failure, so that has
    to be checked explicitly -- an unchecked call here would silently leave
    exactly the orphan this cleanup exists to prevent, recoverable only via
    cleanup.py's sweep.
    """
    if not delete_file_fn(object_key, cleanup_db=False):
        logger.error("Insert failed and S3 cleanup also failed; orphan object left at %s", object_key)
    if thumbnail_key and not delete_file_fn(thumbnail_key, cleanup_db=False):
        logger.error("Insert failed and S3 cleanup also failed; orphan thumbnail left at %s", thumbnail_key)
