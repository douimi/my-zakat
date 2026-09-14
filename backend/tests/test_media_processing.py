"""Unit tests for strip_image_metadata() in media_processing.py.

Task 5 review round 2: GPS/EXIF must never reach the public site a field
photo can be published to. These test the function directly, with real
Pillow-encoded images built in-process -- no S3, no TestClient, no ffmpeg.
"""
import io

from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from media_processing import strip_image_metadata


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


def test_an_animated_gif_is_left_alone_rather_than_collapsed_to_one_frame():
    """should_compress_image() already skips GIF to protect animation;
    strip_image_metadata() must not undo that by re-saving only the current
    frame. GIF also carries no EXIF/GPS in Pillow's model, so there is no
    metadata risk being traded away here."""
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
