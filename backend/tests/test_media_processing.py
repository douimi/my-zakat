"""Unit tests for strip_image_metadata() in media_processing.py.

Task 5 review round 2: GPS/EXIF must never reach the public site a field
photo can be published to. These test the function directly, with real
Pillow-encoded images built in-process -- no S3, no TestClient, no ffmpeg.
"""
import io

import numpy as np
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from media_processing import IMAGE_QUALITY, compress_image, strip_image_metadata


def _jpeg_with_exif(size=(40, 20), orientation=None, gps=False) -> bytes:
    """A real JPEG with an optional Orientation tag and/or GPS IFD."""
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


def test_strips_gps_exif():
    original = _jpeg_with_exif(gps=True)
    assert _open(original).getexif().get_ifd(0x8825)  # sanity: GPS is really there

    stripped = strip_image_metadata(original)

    result = _open(stripped)
    assert result.getexif().get_ifd(0x8825) == {}


def test_applies_orientation_before_discarding_it_so_a_portrait_photo_is_not_sideways():
    # A 40x20 (landscape) pixel buffer with Orientation=6 (rotate 90 deg CW)
    # is what a phone held upright with a landscape-mounted sensor produces:
    # the stored pixels are landscape, the EXIF says "actually portrait".
    # Stripping the tag without applying it first would display this
    # sideways -- the whole point of doing this in two steps, in order.
    original = _jpeg_with_exif(size=(40, 20), orientation=6)
    assert _open(original).size == (40, 20)
    assert _open(original).getexif().get(0x0112) == 6  # sanity

    stripped = strip_image_metadata(original)
    result = _open(stripped)

    assert result.size == (20, 40), "orientation was not applied to the pixels"
    assert result.getexif().get(0x0112) is None, "orientation tag was not discarded"


def test_a_static_gif_which_skips_compression_still_gets_stripped_without_crashing():
    frame = Image.new("RGB", (10, 10), color=(10, 20, 30))
    buf = io.BytesIO()
    frame.save(buf, format="GIF")
    original = buf.getvalue()

    result = strip_image_metadata(original)

    assert result
    assert _open(result).format == "GIF"


def test_strip_removes_the_jpeg_comment_segment():
    """The JPEG COM segment is not EXIF and survives a plain re-save with no
    `exif=` kwarg -- Pillow's writer falls back to im.info["comment"] when
    no comment= is passed at save time. Verified this rides straight
    through compress_image() -> the old strip_image_metadata() untouched;
    arbitrary attacker-controlled text in a file that can end up on the
    public site."""
    img = Image.new("RGB", (20, 20), color=(10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, comment=b"SECRET-COMMENT")
    original = buf.getvalue()
    assert _open(original).info.get("comment") == b"SECRET-COMMENT"  # sanity

    stripped = strip_image_metadata(original)

    assert _open(stripped).info.get("comment") is None


def test_strip_removes_the_gif_comment_extension():
    """Same bug, same fix, GIF's Comment Extension block instead of a JPEG
    COM segment -- and GIF is exactly the format the unconditional strip
    exists to protect, since should_compress_image('image/gif') is False."""
    img = Image.new("RGB", (10, 10), color=(1, 2, 3))
    buf = io.BytesIO()
    img.save(buf, format="GIF", comment=b"SECRET-GIF-COMMENT")
    original = buf.getvalue()
    assert _open(original).info.get("comment") == b"SECRET-GIF-COMMENT"  # sanity

    stripped = strip_image_metadata(original)

    assert _open(stripped).info.get("comment") is None


def _gradient_photo(size=(500, 300)) -> bytes:
    """A synthetic but photo-like JPEG: smooth gradients (where JPEG's DCT
    behaves the way it does on real photos) plus moderate noise (so it isn't
    trivially, perfectly re-compressible). Deliberately not pure random
    noise: two full JPEG encode/decode cycles at the *same* quality already
    disagree by tens of levels per channel on pure noise (measured directly
    -- every high-frequency DCT coefficient is meaningful there, so any
    rounding difference between generations shows up directly), which
    swamps the much smaller, specific effect this test exists to catch.
    """
    width, height = size
    rng = np.random.default_rng(42)
    y, x = np.mgrid[0:height, 0:width]
    base = np.stack([x * 255 / width, y * 255 / height, (x + y) * 255 / (width + height)], axis=-1)
    noise = rng.normal(0, 15, base.shape)
    arr = np.clip(base + noise, 0, 255).astype("uint8")
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def test_strip_does_not_materially_degrade_a_photo_already_compressed():
    """compress_image() saves at quality=IMAGE_QUALITY (85); a naive
    strip_image_metadata() re-save with no quality= falls through to
    Pillow's default of 75 -- a second, invisible generational loss on
    every single upload. Compares the strip's output against the
    compress_image() output it was handed, both by size and by pixel delta.

    Calibrated against the actual pre-fix bug (quality=75, no `quality=`
    kwarg passed) on the same image: that produces a mean per-channel delta
    of ~4.8 and a max of 37, against ~0.08 mean / 10 max for a same-quality
    (85) roundtrip -- so the thresholds below have a wide, deliberate margin
    from the fixed behaviour while still catching the regression.
    """
    photo = _gradient_photo()
    compressed = compress_image(photo)
    stripped = strip_image_metadata(compressed)

    assert len(stripped) >= len(compressed) * 0.98, (
        f"stripped ({len(stripped)} bytes) is meaningfully smaller than "
        f"compressed ({len(compressed)} bytes) -- looks like a quality step-down"
    )

    before = np.asarray(_open(compressed).convert("RGB")).astype(int)
    after = np.asarray(_open(stripped).convert("RGB")).astype(int)
    delta = np.abs(before - after)
    assert delta.mean() <= 1.0, f"strip changed pixels by a mean of {delta.mean():.2f} levels per channel"


def test_an_animated_gif_is_left_alone_rather_than_collapsed_to_one_frame():
    """should_compress_image() already skips GIF to protect animation;
    strip_image_metadata() must not undo that by re-saving only the current
    frame. This is an accepted residual risk, not an absent one -- an
    animated GIF's Application Extension is the standard XMP carrier, and a
    comment block can ride along too -- traded off against destroying the
    animation, which EXIF/GPS-bearing formats (the motivating risk) do not
    present this dilemma for."""
    frames = [Image.new("RGB", (10, 10), color=(i * 40, 0, 0)) for i in range(3)]
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], loop=0)
    original = buf.getvalue()
    assert _open(original).n_frames == 3  # sanity

    result = strip_image_metadata(original)

    assert result == original
    assert _open(result).n_frames == 3


def test_returns_recognisable_image_bytes_when_no_metadata_is_present():
    original = _jpeg_with_exif()  # no orientation, no gps
    stripped = strip_image_metadata(original)
    assert _open(stripped).size == (40, 20)


def test_garbage_bytes_are_returned_unchanged_rather_than_raising():
    garbage = b"not an image at all"
    assert strip_image_metadata(garbage) == garbage


def test_empty_bytes_are_returned_unchanged_rather_than_raising():
    assert strip_image_metadata(b"") == b""
