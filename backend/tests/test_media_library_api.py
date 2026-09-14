"""Media library API tests: model, upload, listing, metadata, transitions."""
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
    """
    from sqlalchemy.orm import Session

    def boom(self):
        raise RuntimeError("database is on fire")

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
