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
    """Capture S3 writes instead of performing them.

    Patches media_library_upload.* (not routers.media_library.*): the
    upload endpoint no longer imports upload_file/delete_file itself, it
    only calls into the pipeline module that does -- these tests exercise
    the pipeline's S3 writes via the router's HTTP surface, not anything
    the router does directly.
    """
    store = {}

    def _upload(content, object_key, content_type=None, metadata=None):
        store[object_key] = (content, content_type)
        return f"http://s3.test/{object_key}"

    def _delete(object_key, cleanup_db=True):
        store.pop(object_key, None)
        return True

    monkeypatch.setattr("media_library_upload.upload_file", _upload)
    monkeypatch.setattr("media_library_upload.delete_file", _delete)
    return store


@pytest.fixture
def no_compression(monkeypatch):
    """media_processing needs Pillow/ffmpeg; keep uploads byte-for-byte in tests.

    Patches media_library_upload.* -- see fake_s3's docstring above for why.
    """
    monkeypatch.setattr("media_library_upload.should_compress_image", lambda ct: False)
    monkeypatch.setattr("media_library_upload.should_compress_video", lambda ct: False)
    monkeypatch.setattr("media_library_upload.generate_video_thumbnail", lambda data: None)
    monkeypatch.setattr("media_library_upload._default_image_dimensions", lambda data: (800, 600))


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


def test_upload_accepts_an_octet_stream_declaration(
    client, field_staff_headers, fake_s3, no_compression
):
    """curl -F "file=@photo.jpg" (and some mobile webviews, and any client
    with no OS MIME mapping) declares application/octet-stream by default.
    That is not a claim about the file's type -- there is nothing to
    contradict -- so a real JPEG declared this way must be accepted and
    stored under the type its own bytes sniff to, not rejected as a spoof.

    This is the regression a second review round caught: the membership
    check that closes the image/gif-over-JPEG bypass must not also catch
    "declared nothing meaningful" in the same net as "declared wrongly"."""
    response = _upload(client, field_staff_headers, content_type="application/octet-stream")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["content_type"] == "image/jpeg"
    assert body["media_type"] == "image"


def test_upload_accepts_a_missing_content_type_declaration(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers, content_type="")
    assert response.status_code == 201, response.text
    assert response.json()["content_type"] == "image/jpeg"


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
    monkeypatch.setattr("media_library_upload.should_compress_video", lambda ct: True)
    monkeypatch.setattr("media_library_upload.compress_video", lambda data: b"transcoded-h264-mp4-bytes")
    monkeypatch.setattr("media_library_upload.generate_video_thumbnail", lambda data: None)

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


def test_a_non_numeric_owner_id_is_a_clean_400(client, auth_headers):
    response = client.get("/api/media-library?owner_id=not-a-number", headers=auth_headers)
    assert response.status_code == 400


def test_a_huge_owner_id_is_a_400_not_a_500(client, auth_headers):
    """int() has no size limit, so this parses fine in Python and would
    otherwise only fail once the query executes -- OverflowError on SQLite,
    a driver range error on PostgreSQL -- landing an authenticated admin on
    an unhandled 500 where the sibling non-numeric case above gives a clean
    400."""
    response = client.get(
        "/api/media-library?owner_id=99999999999999999999", headers=auth_headers
    )
    assert response.status_code == 400


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


# ── Detail, metadata, workspaces ─────────────────────────────────────

def test_detail_returns_the_asset_and_its_site_usage(
    client, db_session, field_staff_headers, field_staff_user
):
    """usage_count must reflect a real cross-reference, not just default to
    zero. Insert a GalleryItem pointing at this asset's own served URL —
    exactly what asset_file_url()/get_media_usage() match on — and assert
    the count actually moves. This is the lock on Task 21's contract: if a
    future publish step writes a differently-shaped URL into Gallery/Story/
    etc., this test is what catches it, not a passing-by-default assertion.
    """
    from models import GalleryItem
    from media_library_service import asset_file_url

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    db_session.add(GalleryItem(media_filename=asset_file_url(asset.id)))
    db_session.commit()

    body = client.get(f"/api/media-library/{asset.id}", headers=field_staff_headers).json()
    assert body["id"] == asset.id
    assert body["usage_count"] == 1
    assert len(body["usage"]["gallery_items"]) == 1


def test_detail_hides_another_members_asset_behind_a_404(
    client, db_session, field_staff_headers, other_field_staff_user
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.get(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 404


def test_patch_updates_metadata_and_rebuilds_search_text(
    client, db_session, field_staff_headers, field_staff_user
):
    # No blank/whitespace-only entry here (the plan's original fixture had
    # one): PATCH now runs validate_tags(), same as upload, and a
    # whitespace-only tag is exactly what that rejects with a 400 rather
    # than silently dropping -- see test_patch_rejects_a_tag_containing_the_
    # delimiter and test_patch_rejects_more_than_max_tags below for that
    # path. This test's job is the case-insensitive dedup and the
    # search_text rebuild, which "Gaza"/"gaza" alone still exercises.
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "Well Opening", "description": "Rafah", "tags": ["Gaza", "gaza"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["tags"] == ["gaza"]

    found = client.get("/api/media-library?q=rafah", headers=field_staff_headers).json()
    assert found["total"] == 1


def test_patch_cannot_change_status(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "x", "status": "public"},
    )
    db_session.refresh(asset)
    assert asset.status == "private"


def test_patch_on_another_members_asset_is_a_404(
    client, db_session, field_staff_headers, other_field_staff_user
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}", headers=field_staff_headers, json={"title": "mine now"}
    )
    assert response.status_code == 404


def test_an_admin_can_edit_any_members_asset(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}", headers=auth_headers, json={"title": "Reviewed"}
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Reviewed"


def test_an_admin_reassigns_an_unassigned_asset_to_a_member(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["owner_id"] == field_staff_user.id


def test_reassigning_to_a_nonexistent_user_is_rejected(
    client, db_session, auth_headers
):
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign", headers=auth_headers, json={"owner_id": 999999}
    )
    assert response.status_code == 404


def test_field_staff_cannot_reassign(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=field_staff_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 403


def test_workspaces_summarises_every_member(
    client, db_session, auth_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", size=100)
    _make_asset(db_session, field_staff_user.id, filename="b.jpg", size=50, status="submitted")
    _make_asset(db_session, other_field_staff_user.id, filename="c.jpg", size=7)
    _make_asset(db_session, None, filename="legacy.jpg", size=3, status="public")

    body = client.get("/api/media-library/workspaces", headers=auth_headers).json()
    by_id = {w["owner_id"]: w for w in body["workspaces"]}

    assert by_id[field_staff_user.id]["asset_count"] == 2
    assert by_id[field_staff_user.id]["total_bytes"] == 150
    assert by_id[field_staff_user.id]["submitted_count"] == 1
    assert by_id[field_staff_user.id]["owner_email"] == field_staff_user.email
    assert by_id[None]["owner_name"] == "Unassigned"


def test_workspaces_includes_staff_who_have_uploaded_nothing(
    client, db_session, auth_headers, field_staff_user
):
    """An empty workspace must still be selectable when reassigning legacy media."""
    body = client.get("/api/media-library/workspaces", headers=auth_headers).json()
    by_id = {w["owner_id"]: w for w in body["workspaces"]}

    assert field_staff_user.id in by_id
    assert by_id[field_staff_user.id]["asset_count"] == 0
    assert None not in by_id, "Unassigned should not appear while it holds nothing"


def test_field_staff_cannot_read_the_workspaces_summary(client, field_staff_headers):
    response = client.get("/api/media-library/workspaces", headers=field_staff_headers)
    assert response.status_code == 403


# ── Task 7 — review round 2 fixes ────────────────────────────────────

def test_patch_rejects_a_tag_containing_the_delimiter(
    client, db_session, field_staff_headers, field_staff_user
):
    """Upload runs parse_tag_input -> validate_tags -> 400 -> normalize_tags.
    PATCH used to run only normalize_tags, so a tag carrying TAG_DELIM was
    silently rewritten instead of rejected -- exactly what validate_tags'
    own docstring says that split exists to prevent."""
    from media_library_service import TAG_DELIM

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"tags": [f"gaza{TAG_DELIM}evil"]},
    )
    assert response.status_code == 400, response.text
    db_session.refresh(asset)
    assert asset.tags == []


def test_patch_rejects_more_than_max_tags(
    client, db_session, field_staff_headers, field_staff_user
):
    from media_library_service import MAX_TAGS

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    too_many = [f"tag{i}" for i in range(MAX_TAGS + 1)]
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"tags": too_many},
    )
    assert response.status_code == 400, response.text
    db_session.refresh(asset)
    assert asset.tags == []


def test_patch_rejects_a_title_over_two_hundred_characters(
    client, db_session, field_staff_headers, field_staff_user
):
    """Symmetric with upload's title check: a PATCH validation problem on
    this resource must also come back as a plain 400, not FastAPI's default
    422 for a Pydantic max_length violation -- two endpoints on one resource
    must not disagree about how to report the same kind of mistake."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "x" * 201},
    )
    assert response.status_code == 400, response.text


def test_owner_cannot_edit_a_public_asset(
    client, db_session, field_staff_headers, field_staff_user
):
    """Reassignment (or a future publish step) can hand a field-staff member
    ownership of an asset that is already live on the public site. Changing
    its title/description/tags once it's public is a reviewer action, not an
    owner action."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "sneaky edit"},
    )
    assert response.status_code == 403
    db_session.refresh(asset)
    assert asset.title is None


def test_an_admin_can_still_edit_a_public_asset(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.patch(
        f"/api/media-library/{asset.id}", headers=auth_headers, json={"title": "Reviewed"}
    )
    assert response.status_code == 200, response.text


def test_reassigning_to_a_non_staff_user_is_rejected(client, db_session, auth_headers, donor_user):
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": donor_user.id},
    )
    assert response.status_code == 400


def test_reassigning_to_a_deactivated_account_is_rejected(
    client, db_session, auth_headers, field_staff_user
):
    """A deactivated account can never log in (get_current_user rejects it),
    so media parked there would be a silent dead end: not in the Unassigned
    pool, and invisible to the one person nominally responsible for it."""
    field_staff_user.is_active = False
    db_session.commit()

    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 400
    db_session.refresh(asset)
    assert asset.owner_id is None


def test_reassigning_with_a_null_owner_id_returns_to_unassigned(
    client, db_session, auth_headers, field_staff_user
):
    """The documented purpose of the nullable field: send an asset back to
    the Unassigned workspace."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": None},
    )
    assert response.status_code == 200, response.text
    assert response.json()["owner_id"] is None


def test_reassignment_preserves_public_status(
    client, db_session, auth_headers, field_staff_user
):
    """The plan deliberately leaves status untouched on reassign -- nothing
    else guarantees that, so pin it down here."""
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "public"


def test_workspaces_includes_an_owner_who_is_no_longer_staff(
    client, db_session, auth_headers, field_staff_user
):
    """A user's role can change after they've uploaded media (e.g. demoted
    to a plain donor account). Their old assets must not vanish from the
    summary -- they surface through the 'owner no longer on staff' branch,
    not the per-role staff query."""
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", size=42)
    field_staff_user.role = "user"
    db_session.commit()

    body = client.get("/api/media-library/workspaces", headers=auth_headers).json()
    by_id = {w["owner_id"]: w for w in body["workspaces"]}

    assert by_id[field_staff_user.id]["asset_count"] == 1
    assert by_id[field_staff_user.id]["total_bytes"] == 42
    assert by_id[field_staff_user.id]["owner_email"] == field_staff_user.email


# ── Submit and review ────────────────────────────────────────────────

def test_owner_submits_a_private_asset_for_review(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "submitted"


def test_submitting_an_already_submitted_asset_is_rejected(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert response.status_code == 400


def test_an_owner_can_withdraw_their_own_submission(
    client, db_session, field_staff_headers, field_staff_user
):
    """The exit from a mistaken submission."""
    asset = _make_asset(db_session, field_staff_user.id, filename="oops.jpg", status="submitted")
    response = client.post(f"/api/media-library/{asset.id}/withdraw", headers=field_staff_headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "private"


def test_withdraw_is_refused_on_someone_elses_asset(
    client, db_session, field_staff_headers, other_field_staff_user
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg", status="submitted")
    response = client.post(f"/api/media-library/{asset.id}/withdraw", headers=field_staff_headers)
    assert response.status_code == 404


def test_withdraw_cannot_unpublish(
    client, db_session, field_staff_headers, field_staff_user
):
    """Pulling live media down stays a reviewer decision."""
    asset = _make_asset(db_session, field_staff_user.id, filename="live.jpg", status="public")
    response = client.post(f"/api/media-library/{asset.id}/withdraw", headers=field_staff_headers)
    assert response.status_code == 400


def test_field_staff_cannot_review(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=field_staff_headers,
        json={"decision": "approve"},
    )
    assert response.status_code == 403


def test_a_manager_approves_a_submitted_asset(
    client, db_session, manager_headers, manager_user, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "approve"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "public"
    assert body["reviewed_at"] is not None

    db_session.refresh(asset)
    assert asset.reviewed_by_id == manager_user.id


def test_rejection_returns_the_asset_to_private_with_a_note(
    client, db_session, manager_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject", "note": "Beneficiary faces are visible"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "private"
    assert body["review_note"] == "Beneficiary faces are visible"


def test_an_admin_can_promote_a_private_asset_directly(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="private")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "approve"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "public"


def test_unpublishing_a_public_asset_returns_it_to_private(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "private"


def test_unpublishing_is_refused_while_the_site_uses_the_asset(
    client, db_session, auth_headers, field_staff_user
):
    from models import GalleryItem

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    db_session.add(GalleryItem(media_filename=f"/api/media-library/{asset.id}/file"))
    db_session.commit()

    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 409
    assert "gallery_items" in str(response.json()["detail"])

    db_session.refresh(asset)
    assert asset.status == "public"


def test_an_unknown_decision_is_rejected(client, db_session, auth_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "shred"}
    )
    assert response.status_code == 422


def test_approving_an_already_public_asset_is_rejected(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "approve"}
    )
    assert response.status_code == 400


def test_field_staff_cannot_submit_someone_elses_asset(
    client, db_session, field_staff_headers, other_field_staff_user
):
    """The table names 'owner' only for private -> submitted. A field-staff
    member reaching into someone else's workspace must not be able to
    trigger it, and must not learn the asset exists at all."""
    asset = _make_asset(db_session, other_field_staff_user.id, filename="a.jpg")
    response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert response.status_code == 404

    db_session.refresh(asset)
    assert asset.status == "private"


def test_direct_promote_sets_reviewer_and_timestamp(
    client, db_session, auth_headers, admin_user, field_staff_user
):
    """private -> public has no queue, but it is still a review decision --
    reviewed_by_id/reviewed_at must be stamped exactly as they are for an
    approve out of 'submitted'."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="private")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "approve"}
    )
    assert response.status_code == 200
    assert response.json()["reviewed_at"] is not None

    db_session.refresh(asset)
    assert asset.reviewed_by_id == admin_user.id
    assert asset.reviewed_at is not None


def test_rejection_preserves_tags_checksum_and_thumbnail(
    client, db_session, manager_headers, field_staff_user
):
    """Rejecting sends media back to private for the owner to fix and
    resubmit -- it must not wipe the very metadata the owner would need to
    look at, or force a needless re-upload."""
    asset = _make_asset(
        db_session, field_staff_user.id, filename="a.jpg", tags=["gaza", "water"], status="submitted"
    )
    asset.checksum_sha256 = "deadbeef" * 8
    asset.thumbnail_key = f"workspaces/{field_staff_user.id}/thumbs/a.jpg"
    db_session.commit()

    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject", "note": "needs a crop"},
    )
    assert response.status_code == 200
    assert response.json()["tags"] == ["gaza", "water"]

    db_session.refresh(asset)
    assert asset.tags == ["gaza", "water"]
    assert asset.checksum_sha256 == "deadbeef" * 8
    assert asset.thumbnail_key == f"workspaces/{field_staff_user.id}/thumbs/a.jpg"


def test_unpublish_guard_matches_the_real_asset_url_shape(
    client, db_session, auth_headers, field_staff_user
):
    """Pin the in-use guard to the actual URL contract (asset_file_url), not
    a hand-typed spelling that could silently drift from it."""
    from media_library_service import asset_file_url
    from models import GalleryItem

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    assert asset_file_url(asset.id) == f"/api/media-library/{asset.id}/file"
    db_session.add(GalleryItem(media_filename=asset_file_url(asset.id)))
    db_session.commit()

    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 409


def test_unpublish_guard_also_catches_a_legacy_assets_proxy_url(
    client, db_session, auth_headers, monkeypatch
):
    """Task 18 backfills pre-existing S3 objects as media_assets rows whose
    object_key predates the workspaces/ convention. Those are referenced in
    content tables by get_file_url()'s proxy URL, not by asset_file_url() --
    get_media_usage matches by exact string equality, so the guard has to
    ask about both spellings or it is blind to exactly the population most
    likely to already be live on the public site. FRONTEND_URL is read by
    get_file_url() at call time from s3_service's module namespace, so it is
    set explicitly here rather than trusted to the ambient environment.
    """
    import s3_service
    from models import GalleryItem

    monkeypatch.setattr(s3_service, "FRONTEND_URL", "https://myzakat.org")

    asset = _make_asset(db_session, None, filename="hero.jpg", status="public")
    asset.object_key = "images/hero.jpg"  # legacy shape: no workspaces/ prefix
    db_session.commit()

    legacy_url = s3_service.get_file_url(asset.object_key)
    assert legacy_url == "https://myzakat.org/api/uploads/media/images/hero.jpg"
    db_session.add(GalleryItem(media_filename=legacy_url))
    db_session.commit()

    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 409
    assert "gallery_items" in str(response.json()["detail"])

    db_session.refresh(asset)
    assert asset.status == "public"


def test_admin_cannot_submit_someone_elses_asset_but_the_owner_can(
    client, db_session, auth_headers, field_staff_headers, field_staff_user
):
    """private -> submitted is granted to 'owner' only. An admin who wants
    the asset public can call /review with approve directly -- submitting
    on someone else's behalf is not a capability any workflow needs, and it
    can park an Unassigned asset in 'submitted' with nobody to act on a
    rejection."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="private")

    admin_response = client.post(f"/api/media-library/{asset.id}/submit", headers=auth_headers)
    assert admin_response.status_code == 404

    db_session.refresh(asset)
    assert asset.status == "private"

    owner_response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert owner_response.status_code == 200, owner_response.text
    assert owner_response.json()["status"] == "submitted"


def test_rejection_without_a_note_is_refused(
    client, db_session, manager_headers, field_staff_user
):
    """A rejection with no note leaves the field-staff member who took the
    photo with no way to know what to fix before resubmitting."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")

    blank = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject", "note": "   "},
    )
    assert blank.status_code == 422

    missing = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject"},
    )
    assert missing.status_code == 422

    db_session.refresh(asset)
    assert asset.status == "submitted"


def test_resubmitting_after_a_rejection_clears_the_stale_reviewer_stamp(
    client, db_session, manager_headers, field_staff_headers, field_staff_user
):
    """After reject -> fix -> resubmit, the row is 'submitted' again but
    must not still carry reviewed_at/reviewed_by_id from the rejection --
    a review-queue UI reading reviewed_at as 'already decided' would get it
    wrong, and migration 31's partial index on status='submitted' says such
    a queue is coming."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    reject = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject", "note": "crop out the background"},
    )
    assert reject.status_code == 200
    db_session.refresh(asset)
    assert asset.reviewed_at is not None
    assert asset.reviewed_by_id is not None

    resubmit = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert resubmit.status_code == 200
    assert resubmit.json()["reviewed_at"] is None

    db_session.refresh(asset)
    assert asset.status == "submitted"
    assert asset.reviewed_at is None
    assert asset.reviewed_by_id is None
    assert asset.review_note is None


# ── Delete ───────────────────────────────────────────────────────────

def test_owner_deletes_their_own_private_asset(
    client, db_session, field_staff_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    fake_s3[asset.object_key] = (b"bytes", "image/jpeg")

    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 200, response.text

    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).first() is None
    assert asset.object_key not in fake_s3


def test_owner_cannot_delete_a_public_asset(
    client, db_session, field_staff_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 403


def test_an_admin_can_delete_a_public_asset(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert response.status_code == 200


def test_delete_is_refused_while_the_site_uses_the_asset(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    from models import GalleryItem

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    db_session.add(GalleryItem(media_filename=f"/api/media-library/{asset.id}/file"))
    db_session.commit()

    response = client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert response.status_code == 409
    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).first() is not None


def test_deleting_another_members_asset_is_a_404(
    client, db_session, field_staff_headers, other_field_staff_user, fake_s3
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 404


def test_delete_also_removes_the_thumbnail(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.mp4", media_type="video")
    asset.thumbnail_key = "workspaces/1/2026/03/a_thumb.jpg"
    db_session.commit()
    fake_s3[asset.object_key] = (b"v", "video/mp4")
    fake_s3[asset.thumbnail_key] = (b"t", "image/jpeg")

    client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert fake_s3 == {}


def test_delete_guard_catches_a_private_legacy_asset(
    client, db_session, auth_headers, monkeypatch, fake_s3
):
    """The guard runs for every status, not just public: a Task 18 backfilled
    asset is referenced by get_file_url()'s proxy URL while sitting at any
    status, because that URL is served straight from S3 and never consults
    this row. Narrowing the guard to status == "public" would delete bytes
    the live site is still serving."""
    import s3_service
    from models import GalleryItem

    monkeypatch.setattr(s3_service, "FRONTEND_URL", "https://myzakat.org")
    asset = _make_asset(db_session, None, filename="hero.jpg", status="private")
    asset.object_key = "images/hero.jpg"  # legacy shape: no workspaces/ prefix
    db_session.commit()
    db_session.add(GalleryItem(media_filename=s3_service.get_file_url(asset.object_key)))
    db_session.commit()

    response = client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert response.status_code == 409
    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).first() is not None


def test_owner_cannot_delete_a_submitted_asset(
    client, db_session, field_staff_headers, field_staff_user, fake_s3
):
    """Only a still-private asset is the owner's to delete -- once it has
    been submitted, removing it becomes a review decision (same rule as
    public, exercised separately above)."""
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 403


def test_delete_survives_an_s3_failure_with_the_row_already_removed(
    client, db_session, auth_headers, field_staff_user, monkeypatch, caplog
):
    """Row-first, S3-second: a failed object delete must not resurrect the
    row or fail the request -- the row is already committed gone by the
    time S3 is touched. cleanup.py's sweep can never find this orphan (it
    walks content rows looking for a missing file, not S3 objects looking
    for a missing row), so the ERROR log line naming the key is the only
    recovery path left, and it must not go missing."""
    import logging

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="private")
    asset_id = asset.id
    object_key = asset.object_key

    monkeypatch.setattr("media_library_upload.delete_file", lambda key, cleanup_db=True: False)

    with caplog.at_level(logging.ERROR):
        response = client.delete(f"/api/media-library/{asset_id}", headers=auth_headers)

    assert response.status_code == 200
    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset_id).first() is None
    assert any(
        "orphan object" in record.message and object_key in record.message
        for record in caplog.records
    )
