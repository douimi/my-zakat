"""The security-critical matrix: who can read which bytes, and who can call what."""
import pytest

from models import MediaAsset


@pytest.fixture
def fake_s3_read(monkeypatch):
    """Serve fixed bytes for any object key.

    Note the two different patch targets: the existence check runs in
    media_library_files, but the bytes are fetched inside stream_s3_object,
    which lives in static_files.
    """
    monkeypatch.setattr("routers.media_library_files.file_exists", lambda key: True)
    monkeypatch.setattr(
        "routers.static_files.get_file_info",
        lambda key: {"size": 5, "content_type": "image/jpeg", "last_modified": None, "etag": "x"},
    )
    monkeypatch.setattr("routers.static_files.download_file", lambda key: b"bytes")


def _asset(db_session, owner_id, status="private", media_type="image"):
    asset = MediaAsset(
        owner_id=owner_id,
        object_key=f"workspaces/{owner_id}/2026/03/{status}-{media_type}.jpg",
        filename="a.jpg",
        media_type=media_type,
        content_type="image/jpeg",
        size_bytes=5,
        search_text="a.jpg",
        status=status,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


# ── Serving ──────────────────────────────────────────────────────────

def test_a_public_asset_is_served_without_authentication(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="public")
    response = client.get(f"/api/media-library/{asset.id}/file")
    assert response.status_code == 200
    assert response.content == b"bytes"
    assert "max-age" in response.headers["cache-control"]


def test_a_private_asset_is_not_served_anonymously(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file")
    assert response.status_code == 404


def test_a_private_asset_is_hidden_from_another_member(
    client, db_session, other_field_staff_user, field_staff_headers, fake_s3_read
):
    asset = _asset(db_session, other_field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=field_staff_headers)
    assert response.status_code == 404, "a 403 here would confirm the asset exists"


def test_a_private_asset_is_served_to_its_owner(
    client, db_session, field_staff_user, field_staff_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=field_staff_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"


def test_a_private_asset_is_served_to_an_admin(
    client, db_session, field_staff_user, auth_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=auth_headers)
    assert response.status_code == 200


def test_a_submitted_asset_is_still_private(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="submitted")
    assert client.get(f"/api/media-library/{asset.id}/file").status_code == 404


def test_a_missing_asset_is_a_404(client, fake_s3_read):
    assert client.get("/api/media-library/999999/file").status_code == 404


def test_a_donor_gets_no_more_than_an_anonymous_caller(
    client, db_session, field_staff_user, donor_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=donor_headers)
    assert response.status_code == 404


def test_range_requests_return_partial_content(
    client, db_session, field_staff_user, monkeypatch, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="public", media_type="video")

    class _Body:
        def read(self):
            return b"yt"

    class _Client:
        def get_object(self, Bucket, Key, Range):
            return {"Body": _Body()}

    monkeypatch.setattr("routers.static_files.get_s3_client", lambda: _Client())

    response = client.get(f"/api/media-library/{asset.id}/file", headers={"Range": "bytes=1-2"})
    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 1-2/5"


# ── Endpoint permission matrix ───────────────────────────────────────

@pytest.mark.parametrize(
    "method,path_suffix,body",
    [
        ("get", "", None),
        ("get", "/workspaces", None),
    ],
)
def test_donors_are_refused_everywhere(client, donor_headers, method, path_suffix, body):
    response = getattr(client, method)(
        f"/api/media-library{path_suffix}", headers=donor_headers
    )
    assert response.status_code == 403


def test_field_staff_are_refused_on_manager_only_endpoints(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _asset(db_session, field_staff_user.id, status="submitted")
    assert client.get("/api/media-library/workspaces", headers=field_staff_headers).status_code == 403
    assert client.post(
        f"/api/media-library/{asset.id}/review",
        headers=field_staff_headers,
        json={"decision": "approve"},
    ).status_code == 403


# ── Cookie auth (media_session) ─────────────────────────────────────
#
# Plain <img>/<video> requests can't carry an Authorization header, so login
# also sets an HttpOnly `media_session` cookie scoped to these routes. The
# `client` fixture is one TestClient shared for the whole session, so it has
# a real cookie jar — logging in through it genuinely leaves the cookie
# attached for the next request made with no explicit headers, the same way
# a browser would behave. `_reset_client_cookies` (conftest.py) clears that
# jar before and after every test so these don't leak into unrelated tests.

LOGIN_PASSWORD = "testpass"  # matches conftest.TEST_PASSWORD / _make_user


def test_a_private_asset_is_served_with_only_a_cookie_no_auth_header(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")

    login = client.post(
        "/api/auth/login",
        json={"email": field_staff_user.email, "password": LOGIN_PASSWORD},
    )
    assert login.status_code == 200
    assert "media_session=" in login.headers.get("set-cookie", "")

    # No `headers=` on either call: whatever the client sends now must come
    # from the cookie jar alone.
    file_response = client.get(f"/api/media-library/{asset.id}/file")
    assert file_response.status_code == 200

    thumb_response = client.get(f"/api/media-library/{asset.id}/thumb")
    assert thumb_response.status_code == 200


def test_a_private_asset_is_a_404_with_neither_cookie_nor_header(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    assert client.get(f"/api/media-library/{asset.id}/file").status_code == 404
    assert client.get(f"/api/media-library/{asset.id}/thumb").status_code == 404


def test_a_cookie_for_a_different_user_is_a_404_not_a_403(
    client, db_session, field_staff_user, other_field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")

    login = client.post(
        "/api/auth/login",
        json={"email": other_field_staff_user.email, "password": LOGIN_PASSWORD},
    )
    assert login.status_code == 200

    response = client.get(f"/api/media-library/{asset.id}/file")
    assert response.status_code == 404, "a 403 here would confirm the asset exists"


def test_the_media_session_cookie_is_scoped_to_media_library_routes(
    client, field_staff_user
):
    """The cookie must carry `path=/api/media-library` — not every API call,
    and not a bare `/`, which would send it to every route on the site."""
    login = client.post(
        "/api/auth/login",
        json={"email": field_staff_user.email, "password": LOGIN_PASSWORD},
    )
    assert login.status_code == 200
    set_cookie = login.headers.get("set-cookie", "")
    assert "media_session=" in set_cookie
    assert "path=/api/media-library" in set_cookie.lower()


def test_logout_clears_the_media_session_cookie(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")

    login = client.post(
        "/api/auth/login",
        json={"email": field_staff_user.email, "password": LOGIN_PASSWORD},
    )
    assert login.status_code == 200
    assert client.get(f"/api/media-library/{asset.id}/file").status_code == 200

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200

    # The cookie jar no longer has a usable media_session cookie, so the
    # asset is unreachable again exactly as if the caller were anonymous.
    assert client.get(f"/api/media-library/{asset.id}/file").status_code == 404
