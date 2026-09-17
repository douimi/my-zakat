"""Direct unit tests for the upload processing pipeline in
media_library_upload.py.

These call process_upload_bytes() / store_processed_upload() /
cleanup_upload_artifacts() directly, with real bytes and no TestClient, no
S3, and -- crucially -- no `no_compression` fixture stubbing out
compression. tests/test_media_library_api.py's HTTP tests almost all use
that fixture (real Pillow/ffmpeg would make the whole suite slow and
flaky), which means the compression/EXIF-stripping branch is reachable
only from the one HTTP test that skips it
(test_upload_strips_gps_exif_from_the_stored_bytes) -- and that test
turns out not to prove what it looks like it proves: compress_image()
saves without an `exif=` kwarg, so for a real JPEG going through
compression, the GPS data is already gone before strip_image_metadata()
ever runs. The actual "strip regardless of whether compression ran"
guarantee -- the one that matters for image/gif, which should_compress_image
always skips -- was never exercised by that HTTP test at all. These tests
close that gap by calling the pipeline directly and asking for exactly the
scenario where compression is skipped and only the strip step protects the
data.
"""
import hashlib
import io

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from media_library_upload import (
    ContentTypeMismatch,
    ProcessedUpload,
    cleanup_upload_artifacts,
    process_upload_bytes,
    store_processed_upload,
)


def _jpeg_with_exif(size=(40, 20), orientation=None, gps=False) -> bytes:
    img = Image.new("RGB", size, color=(200, 50, 50))
    exif = Image.Exif()
    if orientation is not None:
        exif[0x0112] = orientation  # Orientation
    if gps:
        exif[0x8825] = {  # GPSInfo IFD
            1: "N",
            2: (IFDRational(37, 1), IFDRational(46, 1), IFDRational(0, 1)),
            3: "E",
            4: (IFDRational(122, 1), IFDRational(25, 1), IFDRational(0, 1)),
        }
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def _png_bytes(size=(10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(1, 2, 3)).save(buf, format="PNG")
    return buf.getvalue()


# A minimal but genuine JPEG -- same bytes test_media_library_api.py uses.
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 64


# ── Real bytes, end to end, no stubs at all ─────────────────────────────

def test_real_jpeg_bytes_processed_end_to_end_with_no_injected_fakes():
    """The default parameters are the real Pillow implementations -- this
    runs the actual compress + strip + checksum pipeline, not a fixture
    double, and needs neither S3 nor a TestClient to do it."""
    photo = _jpeg_with_exif(size=(64, 48))

    processed = process_upload_bytes("image/jpeg", photo)

    assert isinstance(processed, ProcessedUpload)
    assert processed.media_type == "image"
    assert processed.content_type == "image/jpeg"
    assert processed.width == 64
    assert processed.height == 48
    assert processed.thumbnail_bytes is None
    assert processed.checksum == hashlib.sha256(processed.content).hexdigest()
    # The returned bytes are a real, openable JPEG -- not merely "some bytes".
    assert _open(processed.content).format == "JPEG"


# ── GPS/EXIF stripping guaranteed even when compression is skipped ─────

def test_gps_exif_is_stripped_even_when_compression_is_skipped():
    """should_compress_image() returns False for image/gif specifically so
    animated GIFs survive untouched -- but that same gate must never be
    what protects GPS data, or a caller who can make compression skip also
    dodges the strip. Simulating that by disabling compression directly
    (rather than only via a real GIF, which carries no EXIF to begin with)
    isolates exactly the guarantee the docstring promises: stripping runs
    unconditionally, not as a side effect of compression."""
    photo = _jpeg_with_exif(gps=True)
    assert _open(photo).getexif().get_ifd(0x8825), "sanity: GPS is really present"

    processed = process_upload_bytes(
        "image/jpeg", photo,
        should_compress_image_fn=lambda ct: False,
    )

    result = _open(processed.content)
    assert result.getexif().get_ifd(0x8825) == {}


def test_orientation_is_applied_to_pixels_before_the_tag_is_discarded():
    """Same isolation as above: with compression skipped, the only thing
    that can apply-then-discard the Orientation tag is strip_image_metadata
    running inside the pipeline. A 40x20 (landscape) pixel buffer with
    Orientation=6 is what a phone held upright with a landscape-mounted
    sensor produces -- discarding the tag without applying it first would
    display the stored photo sideways."""
    photo = _jpeg_with_exif(size=(40, 20), orientation=6)
    assert _open(photo).size == (40, 20)
    assert _open(photo).getexif().get(0x0112) == 6  # sanity

    processed = process_upload_bytes(
        "image/jpeg", photo,
        should_compress_image_fn=lambda ct: False,
    )

    result = _open(processed.content)
    assert result.size == (20, 40), "orientation was not applied to the pixels"
    assert result.getexif().get(0x0112) is None, "orientation tag was not discarded"
    assert processed.width == 20 and processed.height == 40


# ── Content-type / byte mismatch rejection ──────────────────────────────

def test_bytes_that_match_no_supported_format_are_rejected():
    with pytest.raises(ContentTypeMismatch):
        process_upload_bytes("image/jpeg", b"<html><script>alert(1)</script></html>")


def test_an_allow_listed_declared_type_that_contradicts_the_real_bytes_is_rejected():
    """A declared image/gif over real JPEG bytes: should_compress_image()
    always skips GIF, so this spoof used to sail through compression (and
    the metadata strip riding along with it) if the sniff didn't catch it
    structurally, regardless of what the compression path would have done."""
    with pytest.raises(ContentTypeMismatch):
        process_upload_bytes("image/gif", JPEG_BYTES)


def test_a_generic_or_missing_declared_type_is_not_treated_as_a_mismatch():
    """application/octet-stream (curl -F's default, and what some mobile
    webviews send) is not a claim about the file's type, so there is
    nothing for the real bytes to contradict."""
    processed = process_upload_bytes("application/octet-stream", JPEG_BYTES)
    assert processed.content_type == "image/jpeg"

    processed = process_upload_bytes("", JPEG_BYTES)
    assert processed.content_type == "image/jpeg"


# ── The relabel guard ────────────────────────────────────────────────────

def test_a_compressor_that_returns_the_original_bytes_does_not_relabel_as_jpeg():
    """compress_image() returns the original object, unchanged, if Pillow
    couldn't process it. process_upload_bytes must only relabel content_type
    to image/jpeg when compression actually produced new bytes -- otherwise
    a PNG Pillow chokes on would be stored as PNG bytes wearing an
    image/jpeg Content-Type label, which is exactly the kind of mismatch
    this whole pipeline exists to prevent. Monkeypatching can't isolate this
    precisely (there's no real-world input that reliably makes Pillow
    "give up" on demand); injecting a fake compress_image_fn that echoes its
    input back, unchanged, is what makes this branch reachable at all."""
    png = _png_bytes()
    processed = process_upload_bytes(
        "image/png", png,
        should_compress_image_fn=lambda ct: True,
        compress_image_fn=lambda data: data,  # Pillow gave up; same object back
    )
    assert processed.content_type == "image/png"


# ── S3 store / cleanup, with fakes injected explicitly ──────────────────

def test_store_processed_upload_writes_the_object_and_a_thumbnail():
    written = {}

    def fake_upload(content, object_key, content_type=None, metadata=None):
        written[object_key] = (content, content_type)
        return f"http://s3.test/{object_key}"

    processed = ProcessedUpload(
        media_type="video", content=b"video-bytes", content_type="video/mp4",
        width=None, height=None, thumbnail_bytes=b"thumb-bytes", checksum="abc",
    )
    thumbnail_key = store_processed_upload(
        processed, "workspaces/1/2026/03/clip.mp4",
        upload_file_fn=fake_upload,
    )

    assert thumbnail_key == "workspaces/1/2026/03/clip_thumb.jpg"
    assert written["workspaces/1/2026/03/clip.mp4"] == (b"video-bytes", "video/mp4")
    assert written[thumbnail_key] == (b"thumb-bytes", "image/jpeg")


def test_store_processed_upload_swallows_a_thumbnail_upload_failure():
    """A failed thumbnail must not fail the whole upload -- only the main
    object's write is allowed to raise uncaught."""
    calls = []

    def flaky_upload(content, object_key, content_type=None, metadata=None):
        calls.append(object_key)
        if "thumb" in object_key:
            raise RuntimeError("thumbnail bucket is unavailable")
        return "ok"

    processed = ProcessedUpload(
        media_type="video", content=b"video-bytes", content_type="video/mp4",
        width=None, height=None, thumbnail_bytes=b"thumb-bytes", checksum="abc",
    )
    thumbnail_key = store_processed_upload(
        processed, "workspaces/1/2026/03/clip.mp4",
        upload_file_fn=flaky_upload,
    )

    assert thumbnail_key is None
    assert len(calls) == 2, "both the object and the thumbnail were attempted"


def test_store_processed_upload_does_not_catch_a_failure_on_the_main_object():
    def always_fails(content, object_key, content_type=None, metadata=None):
        raise RuntimeError("bucket is gone")

    processed = ProcessedUpload(
        media_type="image", content=b"img", content_type="image/jpeg",
        width=1, height=1, thumbnail_bytes=None, checksum="abc",
    )
    with pytest.raises(RuntimeError):
        store_processed_upload(processed, "workspaces/1/2026/03/photo.jpg", upload_file_fn=always_fails)


def test_cleanup_upload_artifacts_deletes_both_object_and_thumbnail():
    deleted = []

    def fake_delete(object_key, cleanup_db=True):
        deleted.append(object_key)
        return True

    cleanup_upload_artifacts(
        "workspaces/1/2026/03/photo.jpg",
        "workspaces/1/2026/03/photo_thumb.jpg",
        delete_file_fn=fake_delete,
    )

    assert deleted == ["workspaces/1/2026/03/photo.jpg", "workspaces/1/2026/03/photo_thumb.jpg"]


def test_cleanup_upload_artifacts_skips_a_null_thumbnail_key():
    deleted = []
    cleanup_upload_artifacts(
        "workspaces/1/2026/03/photo.jpg", None,
        delete_file_fn=lambda object_key, cleanup_db=True: deleted.append(object_key) or True,
    )
    assert deleted == ["workspaces/1/2026/03/photo.jpg"]


def test_cleanup_upload_artifacts_does_not_raise_when_delete_fails():
    """delete_file_fn returning False (rather than raising) must not itself
    raise here -- it is logged, not propagated, so an insert-failure 500
    is never masked by a secondary error out of the cleanup path."""
    cleanup_upload_artifacts(
        "workspaces/1/2026/03/photo.jpg", "workspaces/1/2026/03/photo_thumb.jpg",
        delete_file_fn=lambda object_key, cleanup_db=True: False,
    )


def test_cleanup_upload_artifacts_context_defaults_to_insert_failed(caplog):
    """The default context reproduces the exact log wording the upload path
    always used, before `context` existed as a parameter -- a future caller
    (Task 9's delete, say) is expected to pass its own context rather than
    rely on this default, which would misreport an unrelated failure as an
    insert."""
    with caplog.at_level("ERROR", logger="media_library_upload"):
        cleanup_upload_artifacts(
            "workspaces/1/2026/03/photo.jpg", None,
            delete_file_fn=lambda object_key, cleanup_db=True: False,
        )
    assert "Insert failed and S3 cleanup also failed" in caplog.text


def test_cleanup_upload_artifacts_honours_a_custom_context(caplog):
    with caplog.at_level("ERROR", logger="media_library_upload"):
        cleanup_upload_artifacts(
            "workspaces/1/2026/03/photo.jpg", None,
            context="Delete failed",
            delete_file_fn=lambda object_key, cleanup_db=True: False,
        )
    assert "Delete failed and S3 cleanup also failed" in caplog.text
    assert "Insert failed" not in caplog.text
