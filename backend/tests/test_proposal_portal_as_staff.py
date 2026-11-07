"""An admin opening the submitter portal as the applicant, to unblock a team."""
import pytest

import email_service
import proposal_service as svc
from auth_utils import create_portal_token
from tests.test_project_proposals import _payload
from tests.test_proposal_reports_api import APPLICANT, _dossier

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"


@pytest.fixture(autouse=True)
def _quiet(monkeypatch):
    """No real mail, no real S3."""
    import s3_service
    for name in ("send_proposal_received", "send_report_received"):
        monkeypatch.setattr(email_service, name, lambda **kw: True)
    monkeypatch.setattr(s3_service, "upload_file", lambda content, key, **kw: key)
    monkeypatch.setattr(s3_service, "generate_object_key", lambda prefix, name: "%s/%s" % (prefix, name))


def _open_as_applicant(client, headers, proposal_id):
    return client.post("/api/project-proposals/%d/portal-session" % proposal_id, headers=headers)


def _as(token):
    return {"Authorization": "Bearer %s" % token}


def test_an_admin_sees_the_portal_exactly_as_the_team_does(client, auth_headers, db_session):
    funded = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    other_of_same_team = _dossier(db_session, status="submitted")
    someone_else = _dossier(db_session, email="other@example.com")

    r = _open_as_applicant(client, auth_headers, funded.id)
    assert r.status_code == 200, r.text
    assert r.json()["email"] == APPLICANT

    me = client.get("/api/project-proposals/portal/me", headers=_as(r.json()["token"]))
    assert me.status_code == 200, me.text
    ids = {item["id"] for item in me.json()["items"]}
    assert ids == {funded.id, other_of_same_team.id}
    assert someone_else.id not in ids


def test_a_report_filed_by_an_admin_says_so(client, auth_headers, db_session):
    funded = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    token = _open_as_applicant(client, auth_headers, funded.id).json()["token"]

    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id, headers=_as(token),
        data={"narrative": "Typed in from the team's WhatsApp message."},
        files=[("files", ("report.pdf", PDF, "application/pdf"))],
    )
    assert r.status_code == 201, r.text
    assert svc.current_report(db_session, funded).submitted_by_staff == "testadmin@example.com"

    staff_view = client.get("/api/project-proposals/%d/reports" % funded.id, headers=auth_headers)
    assert staff_view.json()["reports"][0]["submitted_by_staff"] == "testadmin@example.com"


def test_a_report_filed_by_the_team_carries_no_staff_name(client, db_session):
    funded = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    r = client.post(
        "/api/project-proposals/portal/%d/report" % funded.id,
        headers=_as(create_portal_token(APPLICANT)), data={"narrative": "Done."},
    )
    assert r.status_code == 201, r.text
    assert svc.current_report(db_session, funded).submitted_by_staff is None


def test_the_team_never_sees_which_admin_filed_it(client, auth_headers, db_session):
    funded = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    token = _open_as_applicant(client, auth_headers, funded.id).json()["token"]
    client.post("/api/project-proposals/portal/%d/report" % funded.id,
                headers=_as(token), data={"narrative": "Done."})

    me = client.get("/api/project-proposals/portal/me", headers=_as(create_portal_token(APPLICANT)))
    assert "testadmin@example.com" not in me.text


def test_a_revision_filed_by_an_admin_says_so(client, auth_headers, db_session):
    dossier = _dossier(db_session, status="changes_requested")
    token = _open_as_applicant(client, auth_headers, dossier.id).json()["token"]

    r = client.put("/api/project-proposals/portal/%d" % dossier.id, headers=_as(token),
                   json=_payload(email=APPLICANT))
    assert r.status_code == 200, r.text
    db_session.expire_all()  # the request wrote through another session
    assert svc.current_version(db_session, dossier).version_no == 2
    assert svc.current_version(db_session, dossier).submitted_by_staff == "testadmin@example.com"

    detail = client.get("/api/project-proposals/%d" % dossier.id, headers=auth_headers).json()
    assert detail["versions"][-1]["submitted_by_staff"] == "testadmin@example.com"


def test_only_a_manager_or_admin_can_open_the_portal_as_an_applicant(
    client, field_staff_headers, db_session
):
    dossier = _dossier(db_session)
    assert _open_as_applicant(client, {}, dossier.id).status_code == 401
    assert _open_as_applicant(client, field_staff_headers, dossier.id).status_code == 403


def test_the_portal_token_does_not_open_the_admin_console(client, auth_headers, db_session):
    """It is minted by an admin but is still only a portal token."""
    dossier = _dossier(db_session)
    token = _open_as_applicant(client, auth_headers, dossier.id).json()["token"]
    r = client.get("/api/project-proposals/", headers=_as(token))
    assert r.status_code == 401


def test_a_missing_dossier_is_404(client, auth_headers):
    assert _open_as_applicant(client, auth_headers, 999999).status_code == 404
