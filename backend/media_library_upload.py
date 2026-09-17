"""Upload processing pipeline for the media library: the part of the upload
endpoint that touches bytes, Pillow, ffmpeg and S3.

Deliberately NOT part of media_library_service.py -- that module is pure by
design (its own docstring says so: no database, no S3, no Pillow) so its
string/allow-list handling stays cheap to test. This module does real work
over the bytes instead: Pillow decode/encode/EXIF handling, ffmpeg
subprocesses (compress_video/generate_video_thumbnail spawn a process and
read/write temp files -- not network I/O, but not "pure" either), and S3
writes. It gets its own home instead of compromising that module's one
invariant.

The two functions below are meant to be called in sequence, with the
caller's own duplicate-checksum DB query and row insert sandwiched between
them -- see routers/media_library.py's upload_media():

    processed = process_upload_bytes(declared_content_type, content)
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

A handful of hooks (should_compress_image_fn, compress_image_fn,
upload_file_fn, delete_file_fn) are injectable keyword parameters, each
defaulting to None and resolved against this module's own top-level name at
call time -- not bound to the real function at def time -- specifically so
both of these keep working:
  - a direct unit test overriding one explicitly (see
    tests/test_media_library_upload.py), and
  - an HTTP-level test in tests/test_media_library_api.py monkeypatching
    the module-level name (e.g. `media_library_upload.upload_file`) while
    the router calls these functions with no override at all.
A default that snapshotted the real function at def time would silently
stop honouring the second kind of patch the first time this module is
imported. Every other hook this pipeline used to accept (video
compression, thumbnailing, EXIF stripping, dimensions, the thumbnail key
builder) had no caller anywhere in the repo passing anything but that
default, so those aren't parameters at all any more -- just plain calls to
this module's own top-level functions, patchable the same way for the
tests that need it (should_compress_video, compress_video,
generate_video_thumbnail, _default_image_dimensions).
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


def _default_image_dimensions(data: bytes) -> "tuple[Optional[int], Optional[int]]":
    """(width, height) for image bytes, or (None, None) if unreadable.

    The (None, None) branch is not a placeholder to tighten later -- it is
    exactly what a caller should store when dimensions can't be read: the
    MediaAsset columns are nullable for this reason, and a guessed value
    would be worse than an honest NULL.
    """
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
    should_compress_image_fn: Optional[Callable[[str], bool]] = None,
    compress_image_fn: Optional[Callable[[bytes], bytes]] = None,
) -> ProcessedUpload:
    """Sniff, compress, strip and checksum one upload's bytes.

    Raises ContentTypeMismatch if the bytes match no supported format, or
    contradict a declared, allow-listed Content-Type -- the caller should
    treat that as a 400, same message either way ("File content does not
    match its declared type."), same as the pre-extraction router did.

    No database and no S3 here -- see the module docstring for why S3
    writes are a separate step (store_processed_upload) the caller runs
    only after its own duplicate-checksum check passes. Pillow runs
    in-process; a video upload's compression and thumbnailing (ffmpeg
    subprocesses, temp files) happen after this returns, inside the
    media_type == "image" / else branches below -- video's ffmpeg calls are
    not injectable seams (nothing in the repo overrides them), so they're
    plain calls to this module's should_compress_video / compress_video /
    generate_video_thumbnail.

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
      4. Orientation is applied (inside strip_image_metadata) before the
         EXIF block that encodes it is discarded, or a portrait phone photo
         comes back out sideways.
    """
    # Resolved here rather than as ordinary default-parameter values: see
    # the module docstring for why a real function bound at def time would
    # stop honouring a later monkeypatch of this module's own name.
    should_compress_image_fn = should_compress_image_fn or should_compress_image
    compress_image_fn = compress_image_fn or compress_image

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
        content = strip_image_metadata(content)
        width, height = _default_image_dimensions(content)
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
    upload_file_fn: Optional[Callable[..., str]] = None,
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
    upload_file_fn = upload_file_fn or upload_file

    upload_file_fn(processed.content, object_key, content_type=processed.content_type)

    thumbnail_key = None
    if processed.thumbnail_bytes:
        thumbnail_key = build_thumbnail_key(object_key)
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
    context: str = "Insert failed",
    delete_file_fn: Optional[Callable[..., bool]] = None,
) -> None:
    """Best-effort compensating delete for objects store_processed_upload()
    wrote, when nothing ends up pointing at them.

    `context` opens the log line ("<context> and S3 cleanup also failed;
    ..."); the default matches the upload path's original wording exactly.
    A future caller with a different reason to remove these objects (Task 9
    deleting a still-owned asset, say) should pass its own context rather
    than let an operator reading logs during an incident see "Insert
    failed" for a delete that succeeded.

    cleanup_db is hard-coded to False for both the upload-failure case and
    that anticipated delete case, though for different reasons. Here,
    there never was a row: the insert that would have referenced this
    object never landed, so there is nothing for the async orphan sweep
    (s3_service.delete_file's cleanup_db=True path) to find. A delete-path
    caller reaches a different route to the same answer -- *if* it deletes
    its own MediaAsset row first and calls this only afterwards (the
    row-first-S3-second mirror of the create path's S3-first-row-second):
    by the time this runs, the row is already gone, synchronously, in the
    same request, so the background sweep would again find nothing this
    call didn't already handle. That ordering is a precondition on the
    caller, not something this function can enforce -- a caller that
    deletes S3 before the row would need cleanup_db=True instead, which is
    why this stays a parameter rather than being inlined as a bare
    cleanup_db=False at each call site.

    delete_file_fn returns False rather than raising on failure, so that
    has to be checked explicitly -- an unchecked call here would silently
    leave exactly the orphan this cleanup exists to prevent, recoverable
    only via cleanup.py's sweep.
    """
    delete_file_fn = delete_file_fn or delete_file

    if not delete_file_fn(object_key, cleanup_db=False):
        logger.error("%s and S3 cleanup also failed; orphan object left at %s", context, object_key)
    if thumbnail_key and not delete_file_fn(thumbnail_key, cleanup_db=False):
        logger.error("%s and S3 cleanup also failed; orphan thumbnail left at %s", context, thumbnail_key)
