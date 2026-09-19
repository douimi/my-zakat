"""Project proposal dossiers and their append-only version chain."""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError

from models import ProjectProposal, ProposalVersion, ProposalAccessCode


def _content(**overrides) -> dict:
    """A complete, valid set of the 26 proposal content fields."""
    base = {
        "full_name": "Amina Yusuf",
        "national_id": "ID-90210",
        "date_of_birth_year": 1992,
        "place_of_residence": "Sanaa",
        "mobile_number": "+967700000000",
        "email": "amina@example.com",
        "educational_level": "BSc Agriculture",
        "project_name": "Fresh Food Parcels",
        "project_description": "Monthly food parcels for displaced families.",
        "problem_solved": "Families cannot afford fresh protein.",
        "target_beneficiaries": "200 displaced families",
        "community_impact": "Local butchers supply the parcels.",
        "expected_impact": "Better nutrition for 1200 people.",
        "implementation_steps": "Identify families\nBuy supplies\nDistribute",
        "implementation_location": "Sanaa, Old City district",
        "required_materials": "Chicken\nPackaging\nTransport",
        "expected_duration": "Two weeks after funding",
        "continuity_plan": "Local committee takes over procurement.",
        "feasibility": "Suppliers already identified and quoted.",
        "expected_challenges": "Crowding: allocate time slots",
        "number_of_beneficiaries": 200,
        "cost_per_unit_usd": 20.0,
        "unit_type": "family",
        "additional_expenses_usd": 500.0,
        "additional_expenses_description": "Transport and packaging",
        "total_amount_usd": 4500.0,
    }
    base.update(overrides)
    return base


def test_dossier_carries_identity_and_points_at_a_version(db_session):
    dossier = ProjectProposal(email="amina@example.com", full_name="Amina Yusuf", status="submitted")
    db_session.add(dossier)
    db_session.flush()

    version = ProposalVersion(proposal_id=dossier.id, version_no=1, **_content())
    db_session.add(version)
    db_session.flush()

    dossier.current_version_id = version.id
    db_session.commit()

    assert dossier.current_version_id == version.id
    assert version.decision is None
    assert version.decision_comment is None
    assert version.internal_note is None
    assert version.submitted_at is not None


def test_version_numbers_are_unique_per_dossier(db_session):
    dossier = ProjectProposal(email="a@example.com", full_name="A", status="submitted")
    db_session.add(dossier)
    db_session.flush()

    db_session.add(ProposalVersion(proposal_id=dossier.id, version_no=1, **_content()))
    db_session.commit()

    db_session.add(ProposalVersion(proposal_id=dossier.id, version_no=1, **_content()))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_access_code_row_records_its_own_expiry_and_attempts(db_session):
    now = datetime.utcnow()
    code = ProposalAccessCode(
        email="amina@example.com",
        code_hash="$2b$12$notarealhash",
        expires_at=now + timedelta(minutes=10),
        request_ip="203.0.113.7",
    )
    db_session.add(code)
    db_session.commit()

    assert code.attempts == 0
    assert code.consumed_at is None
    assert code.created_at is not None


def test_renderer_produces_a_pdf_from_any_object_carrying_the_content(db_session):
    """The renderer is duck-typed: it reads attributes, not a specific class.

    The router hands it a namespace built from a ProposalVersion plus the
    dossier's id and status; this test hands it the version itself.
    """
    from proposal_pdf import render_proposal_pdf, safe_slug

    dossier = ProjectProposal(email="amina@example.com", full_name="Amina Yusuf", status="submitted")
    db_session.add(dossier)
    db_session.flush()
    version = ProposalVersion(proposal_id=dossier.id, version_no=1, **_content())
    db_session.add(version)
    db_session.commit()

    # The renderer needs .id, .status and .submitted_at alongside the content;
    # a version carries submitted_at, and the dossier carries id and status.
    version.id = dossier.id
    version.status = dossier.status

    pdf = render_proposal_pdf(version)

    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 2000
    assert safe_slug("Fresh Food Parcels!") == "fresh-food-parcels"


def _payload(**overrides) -> dict:
    """The public POST body: content plus the optional consent pair."""
    body = _content()
    body.update(overrides)
    return body


def test_public_submit_creates_a_dossier_with_version_one(client, db_session):
    resp = client.post("/api/project-proposals/", json=_payload())

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["version_no"] == 1
    assert body["id"] > 0
    assert "submitted_at" in body

    dossier = db_session.query(ProjectProposal).filter(ProjectProposal.id == body["id"]).one()
    assert dossier.status == "submitted"
    assert db_session.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == dossier.id
    ).count() == 1


def test_public_submit_always_opens_a_new_dossier(client, db_session):
    first = client.post("/api/project-proposals/", json=_payload()).json()
    second = client.post("/api/project-proposals/", json=_payload()).json()

    assert first["id"] != second["id"]
    assert second["version_no"] == 1


def test_submit_rejects_a_total_that_contradicts_the_breakdown(client):
    resp = client.post("/api/project-proposals/", json=_payload(total_amount_usd=99999.0))
    assert resp.status_code == 422


def test_admin_list_flattens_the_current_version(client, auth_headers):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.get("/api/project-proposals/", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["project_name"] == "Fresh Food Parcels"
    assert item["version_count"] == 1
    assert item["current_version_no"] == 1
    assert item["total_amount_usd"] == 4500.0


def test_admin_list_filters_on_changes_requested(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )

    resp = client.get(
        "/api/project-proposals/?status_filter=changes_requested", headers=auth_headers
    )

    assert resp.status_code == 200
    assert [i["id"] for i in resp.json()["items"]] == [created["id"]]


def test_admin_detail_lists_the_version_history(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={
            "status": "changes_requested",
            "decision_comment": "Detail the transport costs.",
            "internal_note": "Budget looks padded.",
        },
        headers=auth_headers,
    )

    resp = client.get(f"/api/project-proposals/{created['id']}", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "changes_requested"
    assert body["version_count"] == 1
    assert body["versions"][0]["decision"] == "changes_requested"
    assert body["versions"][0]["decision_comment"] == "Detail the transport costs."
    assert body["versions"][0]["internal_note"] == "Budget looks padded."


def test_a_rejection_without_a_message_is_refused(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "rejected"},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert "message" in resp.json()["detail"].lower()


def test_an_invalid_status_is_refused(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "archived", "decision_comment": "x"},
        headers=auth_headers,
    )

    assert resp.status_code == 400


def test_a_historical_version_can_be_read_and_exported(client, auth_headers, db_session):
    from proposal_service import add_revision
    from models import ProjectProposal as PP

    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    dossier = db_session.query(PP).filter(PP.id == created["id"]).one()
    add_revision(db_session, dossier, content=_content(project_name="Parcels v2"),
                 submitted_ip="", sms_consent=False, sms_consent_text=None)

    first = client.get(f"/api/project-proposals/{created['id']}/versions/1", headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["project_name"] == "Fresh Food Parcels"
    assert first.json()["decision"] == "changes_requested"

    current = client.get(f"/api/project-proposals/{created['id']}", headers=auth_headers)
    assert current.json()["project_name"] == "Parcels v2"

    pdf = client.get(f"/api/project-proposals/{created['id']}/versions/1/pdf", headers=auth_headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")
    assert "v1" in pdf.headers["content-disposition"]


def test_a_missing_version_is_a_404(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.get(f"/api/project-proposals/{created['id']}/versions/7", headers=auth_headers)

    assert resp.status_code == 404


def test_admin_endpoints_reject_anonymous_callers(client):
    for path in ("/api/project-proposals/", "/api/project-proposals/1",
                 "/api/project-proposals/1/versions/1", "/api/project-proposals/1/pdf"):
        assert client.get(path).status_code in (401, 403), path


def test_deleting_a_dossier_removes_its_versions(client, auth_headers, db_session):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.delete(f"/api/project-proposals/{created['id']}", headers=auth_headers)

    assert resp.status_code == 200
    assert db_session.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == created["id"]
    ).count() == 0
    assert db_session.query(ProjectProposal).filter(
        ProjectProposal.id == created["id"]
    ).count() == 0


def test_a_decision_emails_the_applicant_once(client, auth_headers, monkeypatch):
    import routers.project_proposals as router_module

    sent = []
    monkeypatch.setattr(
        router_module.email_service, "send_proposal_changes_requested",
        lambda **kwargs: sent.append(kwargs) or True,
    )
    created = client.post("/api/project-proposals/", json=_payload()).json()

    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    # Re-saving the same status (the "save internal note" path) must not re-notify.
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "internal_note": "Chased by phone."},
        headers=auth_headers,
    )

    assert len(sent) == 1
    assert sent[0]["comment"] == "Detail the transport costs."
    assert sent[0]["proposal_id"] == created["id"]


def test_under_review_does_not_email_the_applicant(client, auth_headers, monkeypatch):
    import routers.project_proposals as router_module

    sent = []
    for name in ("send_proposal_approved", "send_proposal_rejected",
                 "send_proposal_changes_requested"):
        monkeypatch.setattr(router_module.email_service, name,
                            lambda **kwargs: sent.append(kwargs) or True)
    created = client.post("/api/project-proposals/", json=_payload()).json()

    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "under_review"}, headers=auth_headers)

    assert sent == []


def test_the_admin_list_puts_recently_touched_dossiers_first(client, auth_headers):
    """Ordering is by last activity, not submission date: a revised or
    freshly-decided file belongs at the top of a review queue."""
    first = client.post("/api/project-proposals/", json=_payload()).json()
    second = client.post("/api/project-proposals/", json=_payload(project_name="Second")).json()

    listed = client.get("/api/project-proposals/", headers=auth_headers).json()["items"]
    assert [i["id"] for i in listed] == [second["id"], first["id"]]

    client.patch(
        f"/api/project-proposals/{first['id']}/status",
        json={"status": "under_review"}, headers=auth_headers,
    )

    listed = client.get("/api/project-proposals/", headers=auth_headers).json()["items"]
    assert [i["id"] for i in listed] == [first["id"], second["id"]]
