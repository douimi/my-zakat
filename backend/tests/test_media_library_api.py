"""Media library API tests: model, upload, listing, metadata, transitions."""
import io
from datetime import datetime

import pytest

from models import MediaAsset


def test_media_asset_defaults(db_session, field_staff_user):
    asset = MediaAsset(
        owner_id=field_staff_user.id,
        object_key="workspaces/1/2026/03/abc.jpg",
        filename="abc.jpg",
        media_type="image",
        content_type="image/jpeg",
        size_bytes=1234,
        search_text="abc.jpg",
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)

    assert asset.id is not None
    assert asset.status == "private"
    assert asset.tags == []
    assert asset.reviewed_by_id is None
    assert isinstance(asset.created_at, datetime)


def test_object_key_is_unique(db_session, field_staff_user):
    for _ in range(2):
        db_session.add(
            MediaAsset(
                owner_id=field_staff_user.id,
                object_key="workspaces/1/2026/03/dupe.jpg",
                filename="dupe.jpg",
                media_type="image",
                content_type="image/jpeg",
                size_bytes=1,
                search_text="dupe.jpg",
            )
        )
    with pytest.raises(Exception):
        db_session.commit()
    db_session.rollback()


# ── Upload ───────────────────────────────────────────────────────────

# The plan's original fixture content (b"fake-image-bytes") is not a real
# JPEG, so once the router sniffs the bytes it gets rejected with 400 before
# any of the upload-success assertions run. Use a minimal but genuine JPEG
# header instead so the happy-path tests exercise the happy path.
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 64


@pytest.fixture
def fake_s3(monkeypatch):
    """Capture S3 writes instead of performing them."""
    store = {}

    def _upload(content, object_key, content_type=None, metadata=None):
        store[object_key] = (content, content_type)
        return f"http://s3.test/{object_key}"

    def _delete(object_key, cleanup_db=True):
        store.pop(object_key, None)
        return True

    monkeypatch.setattr("routers.media_library.upload_file", _upload)
    monkeypatch.setattr("routers.media_library.delete_file", _delete)
    return store


@pytest.fixture
def no_compression(monkeypatch):
    """media_processing needs Pillow/ffmpeg; keep uploads byte-for-byte in tests."""
    monkeypatch.setattr("routers.media_library.should_compress_image", lambda ct: False)
    monkeypatch.setattr("routers.media_library.should_compress_video", lambda ct: False)
    monkeypatch.setattr("routers.media_library.generate_video_thumbnail", lambda data: None)
    monkeypatch.setattr("routers.media_library._image_dimensions", lambda data: (800, 600))


def _upload(client, headers, filename="photo.jpg", content=JPEG_BYTES,
            content_type="image/jpeg", **form):
    return client.post(
        "/api/media-library",
        headers=headers,
        files={"file": (filename, content, content_type)},
        data=form,
    )


def test_upload_creates_a_private_asset_in_the_callers_workspace(
    client, field_staff_headers, field_staff_user, fake_s3, no_compression
):
    response = _upload(
        client, field_staff_headers,
        title="Well opening", description="In Rafah", tags="Gaza, Water-Well",
    )
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["status"] == "private"
    assert body["owner_id"] == field_staff_user.id
    assert body["media_type"] == "image"
    assert body["filename"] == "photo.jpg"
    assert body["tags"] == ["gaza", "water-well"]
    assert body["url"] == f"/api/media-library/{body['id']}/file"
    assert body["object_key"].startswith(f"workspaces/{field_staff_user.id}/")
    assert body["object_key"] in fake_s3


def test_upload_without_tags_succeeds(
    client, field_staff_headers, fake_s3, no_compression
):
    """The common case: a photo uploaded with no tags at all."""
    response = _upload(client, field_staff_headers)
    assert response.status_code == 201, response.text
    assert response.json()["tags"] == []


def test_upload_tolerates_a_trailing_comma_in_tags(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers, tags="gaza,water,")
    assert response.status_code == 201, response.text
    assert response.json()["tags"] == ["gaza", "water"]


def test_upload_rejects_an_unsupported_file_type(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers, filename="notes.pdf",
                       content=b"%PDF-", content_type="application/pdf")
    assert response.status_code == 400


def test_upload_rejects_bytes_that_contradict_the_declared_type(
    client, field_staff_headers, fake_s3, no_compression
):
    """A spoofed Content-Type must not get a non-image classified as an image."""
    response = _upload(client, field_staff_headers, filename="payload.jpg",
                       content=b"<html><script>alert(1)</script></html>",
                       content_type="image/jpeg")
    assert response.status_code == 400
    assert fake_s3 == {}, "nothing may reach S3 when the bytes are rejected"


def test_upload_rejects_an_empty_file(client, field_staff_headers, fake_s3, no_compression):
    response = _upload(client, field_staff_headers, content=b"")
    assert response.status_code == 400


def test_upload_rejects_a_file_over_the_size_limit(
    client, field_staff_headers, fake_s3, no_compression, monkeypatch
):
    monkeypatch.setattr("routers.media_library.MAX_UPLOAD_BYTES", 10)
    response = _upload(client, field_staff_headers, content=b"more than ten bytes")
    assert response.status_code == 413


def test_uploading_the_same_bytes_twice_returns_409(
    client, field_staff_headers, fake_s3, no_compression
):
    assert _upload(client, field_staff_headers).status_code == 201
    duplicate = _upload(client, field_staff_headers, filename="copy.jpg")
    assert duplicate.status_code == 409
    assert "existing" in duplicate.json()["detail"]


def test_the_same_bytes_in_two_workspaces_are_not_duplicates(
    client, field_staff_headers, other_field_staff_headers, fake_s3, no_compression
):
    assert _upload(client, field_staff_headers).status_code == 201
    assert _upload(client, other_field_staff_headers).status_code == 201


def test_a_failed_insert_leaves_no_orphan_object(
    client, field_staff_headers, fake_s3, no_compression
):
    """A committed session error must not leave an orphaned S3 object.

    Session.commit is patched at the class level (the router's db session
    comes from a Depends(get_db) instance we have no other handle on), which
    means it is patched for every Session in the process for as long as the
    patch is live -- including the db_session fixture's own cleanup commit
    used to wipe tables between tests. Using pytest.MonkeyPatch.context()
    rather than the function-scoped `monkeypatch` fixture undoes the patch
    the moment this block exits, before any other fixture teardown runs, so
    it cannot leak into unrelated teardown and fail it.

    Raises SQLAlchemyError specifically, not a bare RuntimeError: the router
    now narrows its `except` around the insert to SQLAlchemyError, on
    purpose, so a bug elsewhere in the handler surfaces as an unhandled 500
    instead of being misreported as "Could not save the uploaded file."
    """
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session

    def boom(self):
        raise SQLAlchemyError("database is on fire")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(Session, "commit", boom)
        response = _upload(client, field_staff_headers)

    assert response.status_code == 500
    assert fake_s3 == {}


def test_a_donor_cannot_upload(client, donor_headers, fake_s3, no_compression):
    assert _upload(client, donor_headers).status_code == 403


def test_an_anonymous_caller_cannot_upload(client, fake_s3, no_compression):
    response = client.post(
        "/api/media-library",
        files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
    )
    assert response.status_code in (401, 403)


# ── Upload — review round 2 fixes ───────────────────────────────────────

def test_a_3gp_upload_is_relabeled_video_mp4_after_transcoding(
    client, field_staff_headers, fake_s3, monkeypatch
):
    """compress_video() always transcodes into H.264/MP4 regardless of the
    source container. 3GP is what low-end Android phones produce -- exactly
    the field-worker population this format was widened for -- so storing
    the transcoded bytes under the original video/3gpp label would produce
    a file nothing plays."""
    monkeypatch.setattr("routers.media_library.should_compress_video", lambda ct: True)
    monkeypatch.setattr("routers.media_library.compress_video", lambda data: b"transcoded-h264-mp4-bytes")
    monkeypatch.setattr("routers.media_library.generate_video_thumbnail", lambda data: None)

    # ISO-BMFF 'ftyp' box at offset 4 -- what the byte sniffer requires for
    # any of mp4/mov/m4v/3gp.
    content = b"\x00\x00\x00\x18ftyp3gp4" + b"\x00" * 32
    response = _upload(client, field_staff_headers, filename="clip.3gp",
                        content=content, content_type="video/3gpp")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["media_type"] == "video"
    assert body["content_type"] == "video/mp4"
    assert fake_s3[body["object_key"]][1] == "video/mp4"


def test_avi_and_ogv_uploads_are_accepted(
    client, field_staff_headers, fake_s3, no_compression
):
    """AVI (RIFF + 'AVI ' at offset 8) and Ogg (OggS) are both in the
    Content-Type allow-list; the sniffer previously recognised neither, so a
    legitimate upload of either was told its content was a forgery."""
    avi_content = b"RIFF" + b"\x00\x00\x00\x00" + b"AVI " + b"\x00" * 32
    response = _upload(client, field_staff_headers, filename="clip.avi",
                        content=avi_content, content_type="video/x-msvideo")
    assert response.status_code == 201, response.text

    ogv_content = b"OggS" + b"\x00" * 32
    response = _upload(client, field_staff_headers, filename="clip.ogv",
                        content=ogv_content, content_type="video/ogg")
    assert response.status_code == 201, response.text


def test_upload_rejects_a_declared_gif_over_real_jpeg_bytes(
    client, field_staff_headers, fake_s3, no_compression
):
    """should_compress_image() always skips GIF (to protect animation), so
    a caller declaring image/gif over real JPEG bytes used to sail through
    with the compression pass -- and the metadata stripping that rode along
    with it as a side effect -- skipped entirely. The format-level sniff
    check must reject this outright, structurally, regardless of what the
    compression path would or would not have done."""
    response = _upload(client, field_staff_headers, filename="photo.gif",
                        content=JPEG_BYTES, content_type="image/gif")
    assert response.status_code == 400
    assert fake_s3 == {}


def test_upload_strips_gps_exif_from_the_stored_bytes(client, field_staff_headers, fake_s3):
    """End-to-end confirmation that the router actually calls
    strip_image_metadata() (unit-tested directly in test_media_processing.py)
    on every image, not just that the function works in isolation."""
    from PIL import Image
    from PIL.TiffImagePlugin import IFDRational

    img = Image.new("RGB", (40, 20), color=(200, 50, 50))
    exif = Image.Exif()
    exif[0x8825] = {
        1: "N",
        2: (IFDRational(37, 1), IFDRational(46, 1), IFDRational(0, 1)),
        3: "E",
        4: (IFDRational(122, 1), IFDRational(25, 1), IFDRational(0, 1)),
    }
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    gps_jpeg = buf.getvalue()

    response = _upload(client, field_staff_headers, content=gps_jpeg)
    assert response.status_code == 201, response.text

    stored_bytes, _ = fake_s3[response.json()["object_key"]]
    result = Image.open(io.BytesIO(stored_bytes))
    assert result.getexif().get_ifd(0x8825) == {}


def test_upload_rejects_a_title_over_two_hundred_characters(
    client, field_staff_headers, fake_s3, no_compression
):
    """title is VARCHAR(200); SQLite (this suite's engine) does not enforce
    that, so without an explicit check this would only ever surface as a
    PostgreSQL DataError in production -- caught by the broad except and
    reported as a generic 500, sending the user to retry the same upload."""
    response = _upload(client, field_staff_headers, title="x" * 201)
    assert response.status_code == 400
    assert fake_s3 == {}


def test_upload_gives_a_specific_hint_for_heic(client, field_staff_headers, fake_s3):
    """unsupported_hint() was built by Task 3 specifically for this
    endpoint and the router never called it -- an iPhone user uploading a
    default-camera-format HEIC photo got a generic "unsupported file type"
    with no explanation."""
    response = _upload(client, field_staff_headers, filename="photo.heic",
                        content=b"whatever", content_type="image/heic")
    assert response.status_code == 400
    assert "HEIC" in response.json()["detail"]


# ── Listing ──────────────────────────────────────────────────────────

def _make_asset(db_session, owner_id, filename="a.jpg", title=None, description=None,
                tags=None, status="private", size=100, media_type="image"):
    from media_library_service import build_search_text
    asset = MediaAsset(
        owner_id=owner_id,
        object_key=f"workspaces/{owner_id}/2026/03/{filename}-{size}-{status}",
        filename=filename,
        media_type=media_type,
        content_type="image/jpeg" if media_type == "image" else "video/mp4",
        size_bytes=size,
        title=title,
        description=description,
        tags=tags or [],
        search_text=build_search_text(filename, title, description, tags),
        status=status,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


def test_field_staff_only_sees_their_own_workspace(
    client, db_session, field_staff_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")

    body = client.get("/api/media-library", headers=field_staff_headers).json()
    assert [item["filename"] for item in body["items"]] == ["mine.jpg"]
    assert body["total"] == 1


def test_field_staff_cannot_widen_scope_with_owner_id(
    client, db_session, field_staff_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    body = client.get(
        f"/api/media-library?owner_id={other_field_staff_user.id}",
        headers=field_staff_headers,
    ).json()
    assert body["items"] == []


def test_an_admin_sees_every_workspace(
    client, db_session, auth_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    _make_asset(db_session, None, filename="legacy.jpg", status="public")

    body = client.get("/api/media-library", headers=auth_headers).json()
    assert body["total"] == 3


def test_an_admin_can_filter_to_the_unassigned_workspace(
    client, db_session, auth_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, None, filename="legacy.jpg", status="public")

    body = client.get("/api/media-library?owner_id=unassigned", headers=auth_headers).json()
    assert [item["filename"] for item in body["items"]] == ["legacy.jpg"]


def test_search_matches_filename_title_description_and_tags(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="IMG_4821.jpg",
                title="Well opening", description="Ceremony in Rafah", tags=["gaza"])
    _make_asset(db_session, field_staff_user.id, filename="other.jpg", title="Nothing")

    for query in ("img_4821", "well", "rafah", "gaza"):
        body = client.get(f"/api/media-library?q={query}", headers=field_staff_headers).json()
        assert body["total"] == 1, f"query {query!r} matched {body['total']} rows"


def test_search_is_case_insensitive(client, db_session, field_staff_headers, field_staff_user):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", title="Well Opening")
    body = client.get("/api/media-library?q=WELL", headers=field_staff_headers).json()
    assert body["total"] == 1


def test_the_tag_filter_matches_whole_tags_only(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", tags=["gaza", "water-well"])
    assert client.get("/api/media-library?tag=gaza", headers=field_staff_headers).json()["total"] == 1
    assert client.get("/api/media-library?tag=gaz", headers=field_staff_headers).json()["total"] == 0


def test_filter_by_type_and_status(client, db_session, field_staff_headers, field_staff_user):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", media_type="image")
    _make_asset(db_session, field_staff_user.id, filename="b.mp4", media_type="video",
                status="submitted")

    assert client.get("/api/media-library?type=video", headers=field_staff_headers).json()["total"] == 1
    assert client.get("/api/media-library?status=submitted", headers=field_staff_headers).json()["total"] == 1


def test_sorting_by_size_in_both_directions(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="small.jpg", size=10)
    _make_asset(db_session, field_staff_user.id, filename="big.jpg", size=999)

    asc = client.get("/api/media-library?sort=size&order=asc", headers=field_staff_headers).json()
    assert [i["filename"] for i in asc["items"]] == ["small.jpg", "big.jpg"]

    desc = client.get("/api/media-library?sort=size&order=desc", headers=field_staff_headers).json()
    assert [i["filename"] for i in desc["items"]] == ["big.jpg", "small.jpg"]


def test_wildcards_in_search_and_tag_are_literal_not_patterns(
    client, db_session, field_staff_headers, field_staff_user
):
    """Fails if a caller ever drops escape= from the ilike() call."""
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", tags=["gaza"])
    _make_asset(db_session, field_staff_user.id, filename="b.jpg", tags=["water"])

    # "%" is a LIKE wildcard; as a query it must match nothing, not everything.
    assert client.get("/api/media-library?q=%25", headers=field_staff_headers).json()["total"] == 0
    assert client.get("/api/media-library?tag=%25", headers=field_staff_headers).json()["total"] == 0


def test_an_unknown_sort_field_is_rejected(client, field_staff_headers):
    response = client.get("/api/media-library?sort=password", headers=field_staff_headers)
    assert response.status_code == 400


def test_pagination_reports_totals_and_slices(
    client, db_session, field_staff_headers, field_staff_user
):
    for index in range(5):
        _make_asset(db_session, field_staff_user.id, filename=f"f{index}.jpg", size=index)

    body = client.get(
        "/api/media-library?page=2&page_size=2&sort=size&order=asc",
        headers=field_staff_headers,
    ).json()
    assert body["total"] == 5
    assert body["page"] == 2
    assert body["page_size"] == 2
    assert [i["filename"] for i in body["items"]] == ["f2.jpg", "f3.jpg"]


def test_a_donor_cannot_list(client, donor_headers):
    assert client.get("/api/media-library", headers=donor_headers).status_code == 403
