"""Media library project folders: filing at upload, refiling, browsing."""
import pytest

from models import MediaAsset, ProjectProposal, ProposalVersion
from tests.test_media_library_api import (  # noqa: F401 — fixtures are used by name
    _make_asset,
    _upload,
    fake_s3,
    no_compression,
)
from tests.test_project_proposals import _content


def _project(db_session, status="funded", name="Rice distribution"):
    dossier = ProjectProposal(email=f"{name}@example.com", full_name="Team", status=status)
    db_session.add(dossier)
    db_session.flush()
    version = ProposalVersion(
        proposal_id=dossier.id, version_no=1, **_content(project_name=name))
    db_session.add(version)
    db_session.flush()
    dossier.current_version_id = version.id
    db_session.commit()
    return dossier


def _file(db_session, asset, project):
    asset.project_id = project.id if project else None
    db_session.commit()
    return asset


# ── Filing at upload ─────────────────────────────────────────────────

def test_upload_files_media_under_the_chosen_project(
    client, db_session, field_staff_headers, fake_s3, no_compression
):
    project = _project(db_session)
    response = _upload(client, field_staff_headers, project_id=str(project.id))
    assert response.status_code == 201, response.text
    assert response.json()["project_id"] == project.id


def test_upload_without_a_project_lands_in_unassigned(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers)
    assert response.status_code == 201, response.text
    assert response.json()["project_id"] is None


@pytest.mark.parametrize("raw", ["abc", "1.5", "99999999999999999999"])
def test_upload_rejects_a_malformed_project_id_before_storing_anything(
    client, field_staff_headers, fake_s3, no_compression, raw
):
    response = _upload(client, field_staff_headers, project_id=raw)
    assert response.status_code == 400
    assert fake_s3 == {}


def test_upload_rejects_a_project_that_does_not_exist(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers, project_id="424242")
    assert response.status_code == 404
    assert fake_s3 == {}


@pytest.mark.parametrize("status", ["submitted", "under_review", "changes_requested", "rejected"])
def test_upload_refuses_a_project_that_is_not_approved(
    client, db_session, field_staff_headers, fake_s3, no_compression, status
):
    project = _project(db_session, status=status)
    response = _upload(client, field_staff_headers, project_id=str(project.id))
    assert response.status_code == 400
    assert fake_s3 == {}


# ── Refiling ─────────────────────────────────────────────────────────

def test_an_owner_files_their_asset_under_a_project_and_back_out(
    client, db_session, field_staff_headers, field_staff_user
):
    project = _project(db_session)
    asset = _make_asset(db_session, field_staff_user.id)

    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=field_staff_headers, json={"project_id": project.id})
    assert response.status_code == 200, response.text
    assert response.json()["project_id"] == project.id

    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=field_staff_headers, json={"project_id": None})
    assert response.status_code == 200, response.text
    assert response.json()["project_id"] is None


@pytest.mark.parametrize("raw", [True, 1.5, [1], "x"])
def test_refile_rejects_values_that_are_not_an_integer(
    client, db_session, auth_headers, field_staff_user, raw
):
    _project(db_session)  # id 1 exists, so `true` -> 1 would otherwise succeed
    asset = _make_asset(db_session, field_staff_user.id)
    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=auth_headers, json={"project_id": raw})
    assert response.status_code == 400, response.text
    db_session.refresh(asset)
    assert asset.project_id is None


def test_refile_refuses_a_project_that_is_not_approved(
    client, db_session, auth_headers, field_staff_user
):
    project = _project(db_session, status="rejected")
    asset = _make_asset(db_session, field_staff_user.id)
    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=auth_headers, json={"project_id": project.id})
    assert response.status_code == 400


def test_field_staff_cannot_refile_someone_elses_asset(
    client, db_session, field_staff_headers, manager_user
):
    project = _project(db_session)
    asset = _make_asset(db_session, manager_user.id)
    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=field_staff_headers, json={"project_id": project.id})
    assert response.status_code == 404


def test_an_owner_cannot_refile_public_media(
    client, db_session, field_staff_headers, field_staff_user
):
    """Same rule as editing a caption: once public, it is a reviewer's call."""
    project = _project(db_session)
    asset = _make_asset(db_session, field_staff_user.id, status="public")
    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=field_staff_headers, json={"project_id": project.id})
    assert response.status_code == 403


def test_a_reviewer_can_refile_anyones_asset(
    client, db_session, auth_headers, field_staff_user
):
    project = _project(db_session)
    asset = _make_asset(db_session, field_staff_user.id, status="public")
    response = client.post(f"/api/media-library/{asset.id}/project",
                           headers=auth_headers, json={"project_id": project.id})
    assert response.status_code == 200, response.text
    assert response.json()["project_id"] == project.id


# ── Browsing a folder ────────────────────────────────────────────────

def test_listing_filters_to_one_project_folder(
    client, db_session, auth_headers, field_staff_user
):
    rice, wells = _project(db_session, name="Rice"), _project(db_session, name="Wells")
    in_rice = _file(db_session, _make_asset(db_session, field_staff_user.id, "r.jpg"), rice)
    _file(db_session, _make_asset(db_session, field_staff_user.id, "w.jpg"), wells)
    loose = _make_asset(db_session, field_staff_user.id, "loose.jpg")

    response = client.get("/api/media-library", headers=auth_headers,
                          params={"project_id": rice.id})
    assert [a["id"] for a in response.json()["items"]] == [in_rice.id]

    response = client.get("/api/media-library", headers=auth_headers,
                          params={"project_id": "unassigned"})
    assert [a["id"] for a in response.json()["items"]] == [loose.id]


def test_a_folder_stays_browsable_after_its_project_stops_being_fileable(
    client, db_session, auth_headers, field_staff_user
):
    """Filing is gated on status; browsing is not, or the media would vanish."""
    project = _project(db_session)
    asset = _file(db_session, _make_asset(db_session, field_staff_user.id), project)
    project.status = "rejected"
    db_session.commit()

    response = client.get("/api/media-library", headers=auth_headers,
                          params={"project_id": project.id})
    assert response.status_code == 200
    assert [a["id"] for a in response.json()["items"]] == [asset.id]


def test_a_project_folder_still_only_shows_field_staff_their_own_media(
    client, db_session, field_staff_headers, field_staff_user, manager_user
):
    project = _project(db_session)
    mine = _file(db_session, _make_asset(db_session, field_staff_user.id, "mine.jpg"), project)
    _file(db_session, _make_asset(db_session, manager_user.id, "theirs.jpg"), project)

    response = client.get("/api/media-library", headers=field_staff_headers,
                          params={"project_id": project.id})
    assert [a["id"] for a in response.json()["items"]] == [mine.id]


# ── The folder summary ───────────────────────────────────────────────

def _folders(client, headers):
    response = client.get("/api/media-library/projects", headers=headers)
    assert response.status_code == 200, response.text
    return {f["project_id"]: f for f in response.json()["projects"]}


def test_folders_count_photos_videos_and_pending_review(
    client, db_session, auth_headers, field_staff_user
):
    project = _project(db_session, name="Rice distribution")
    for name, kind, status in [("a.jpg", "image", "private"),
                               ("b.jpg", "image", "submitted"),
                               ("c.mp4", "video", "public")]:
        _file(db_session, _make_asset(db_session, field_staff_user.id, name,
                                      media_type=kind, status=status), project)

    folder = _folders(client, auth_headers)[project.id]
    assert folder["name"] == "Rice distribution"
    assert folder["fileable"] is True
    assert (folder["asset_count"], folder["image_count"], folder["video_count"]) == (3, 2, 1)
    assert folder["submitted_count"] == 1


def test_folders_list_empty_approved_projects_so_they_can_be_chosen(
    client, db_session, auth_headers
):
    project = _project(db_session, status="approved")
    folder = _folders(client, auth_headers)[project.id]
    assert folder["asset_count"] == 0
    assert folder["fileable"] is True


def test_folders_hide_applications_that_are_not_projects(
    client, db_session, field_staff_headers
):
    """An application under review has no media, and its name is not staff business."""
    pending = _project(db_session, status="under_review", name="Secret plan")
    assert pending.id not in _folders(client, field_staff_headers)


def test_folders_keep_a_project_that_holds_media_whatever_its_status(
    client, db_session, auth_headers, field_staff_user
):
    project = _project(db_session)
    _file(db_session, _make_asset(db_session, field_staff_user.id), project)
    project.status = "rejected"
    db_session.commit()

    folder = _folders(client, auth_headers)[project.id]
    assert folder["asset_count"] == 1
    assert folder["fileable"] is False


def test_unassigned_appears_only_while_it_holds_something(
    client, db_session, auth_headers, field_staff_user
):
    _project(db_session)
    assert None not in _folders(client, auth_headers)

    _make_asset(db_session, field_staff_user.id)
    assert _folders(client, auth_headers)[None]["asset_count"] == 1


def test_field_staff_folder_counts_cover_only_their_own_media(
    client, db_session, field_staff_headers, field_staff_user, manager_user
):
    project = _project(db_session)
    _file(db_session, _make_asset(db_session, field_staff_user.id, "mine.jpg"), project)
    _file(db_session, _make_asset(db_session, manager_user.id, "theirs.jpg"), project)
    _make_asset(db_session, manager_user.id, "loose.jpg")

    folders = _folders(client, field_staff_headers)
    assert folders[project.id]["asset_count"] == 1
    # The only unassigned media is someone else's, so the caller has none.
    assert None not in folders


def test_a_folder_is_named_after_the_current_version(
    client, db_session, auth_headers
):
    project = _project(db_session, name="First draft name")
    revised = ProposalVersion(proposal_id=project.id, version_no=2,
                              **_content(project_name="Final name"))
    db_session.add(revised)
    db_session.flush()
    project.current_version_id = revised.id
    db_session.commit()

    assert _folders(client, auth_headers)[project.id]["name"] == "Final name"


def test_folders_require_staff(client, donor_headers):
    response = client.get("/api/media-library/projects", headers=donor_headers)
    assert response.status_code in (401, 403)


def test_assets_carry_their_project_id(db_session, field_staff_user):
    from media_library_service import serialize_asset
    project = _project(db_session)
    asset = _file(db_session, _make_asset(db_session, field_staff_user.id), project)
    assert serialize_asset(db_session.get(MediaAsset, asset.id))["project_id"] == project.id
