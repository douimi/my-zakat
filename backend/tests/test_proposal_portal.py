"""Portal authentication: token isolation, one-time codes, revision rules."""
import pytest
from datetime import timedelta

from models import ProjectProposal, ProposalAccessCode, ProposalVersion
from tests.test_project_proposals import _content, _payload


def test_a_portal_token_is_not_a_user_session(admin_user):
    """The defect this closes: a portal token for a staff address must not
    authenticate as that staff member."""
    from auth_utils import create_portal_token, verify_token

    token = create_portal_token(admin_user.email)

    assert verify_token(token) is None


def test_a_staff_token_is_still_a_user_session(admin_user):
    from auth_utils import create_access_token, verify_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_token(token) == admin_user.email


def test_a_portal_token_resolves_only_through_the_portal_verifier():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com")

    assert verify_portal_token(token) == "applicant@example.com"
    assert verify_portal_token("not-a-token") is None


def test_a_staff_token_is_not_a_portal_session(admin_user):
    from auth_utils import create_access_token, verify_portal_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_portal_token(token) is None


def test_an_expired_portal_token_is_refused():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com", expires_delta=timedelta(minutes=-1))

    assert verify_portal_token(token) is None


def test_a_portal_token_is_not_attributed_to_a_staff_member_in_the_audit_log(
    admin_user, monkeypatch
):
    """A rejected portal request must not appear in the audit trail under an
    administrator's name -- that would disguise the very confusion the typ
    claim exists to prevent."""
    import audit_middleware
    import auth_utils
    from audit_middleware import _decode_user_from_request
    from auth_utils import create_access_token, create_portal_token

    # audit_middleware defaults SECRET_KEY to "dev-only-insecure-secret-key"
    # while auth_utils defaults it to "test-secret-key-not-for-production"
    # under TESTING=true. In production both read the same env var, so align
    # them here -- otherwise the decoder rejects every token on signature
    # alone and the test would pass without exercising the typ check at all.
    monkeypatch.setattr(audit_middleware, "SECRET_KEY", auth_utils.SECRET_KEY)

    class _Request:
        def __init__(self, token):
            self.headers = {"authorization": f"Bearer {token}"}
            self.cookies = {}

    portal = _decode_user_from_request(_Request(create_portal_token(admin_user.email)))
    staff = _decode_user_from_request(_Request(create_access_token({"sub": admin_user.email})))

    # Returns a dict (or None), so compare by key -- getattr on a dict would
    # yield None and pass vacuously even with the bug present.
    assert portal is None
    assert staff is not None
    assert staff["email"] == admin_user.email


# ── Helpers ──────────────────────────────────────────────────────────

def _sign_in(client, email: str) -> dict:
    """Request a code, capture it from the mailer, exchange it for a token."""
    import routers.proposal_portal as portal_module

    captured = {}
    original = portal_module.email_service.send_proposal_access_code

    def capture(**kwargs):
        captured.update(kwargs)
        return True

    portal_module.email_service.send_proposal_access_code = capture
    try:
        resp = client.post("/api/project-proposals/portal/request-code", json={"email": email})
        assert resp.status_code == 202, resp.text
        code = captured["code"]
    finally:
        portal_module.email_service.send_proposal_access_code = original

    verified = client.post(
        "/api/project-proposals/portal/verify-code", json={"email": email, "code": code}
    )
    assert verified.status_code == 200, verified.text
    return {"Authorization": f"Bearer {verified.json()['token']}"}


def _submit_and_request_changes(client, auth_headers, **content_overrides) -> int:
    created = client.post("/api/project-proposals/", json=_payload(**content_overrides)).json()
    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return created["id"]


# ── Request / verify ─────────────────────────────────────────────────

def test_requesting_a_code_answers_identically_for_an_unknown_address(client):
    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "nobody-here@example.com"})

    assert resp.status_code == 202
    assert resp.json() == {
        "message": "If that address has a proposal with us, a sign-in code is on its way."
    }


def test_no_code_is_emailed_to_an_address_with_no_proposal(client, db_session, monkeypatch):
    import routers.proposal_portal as portal_module

    sent = []
    monkeypatch.setattr(portal_module.email_service, "send_proposal_access_code",
                        lambda **kwargs: sent.append(kwargs) or True)

    client.post("/api/project-proposals/portal/request-code",
                json={"email": "nobody-here@example.com"})

    assert sent == []
    assert db_session.query(ProposalAccessCode).count() == 0


def test_a_known_address_gets_the_same_reply_as_an_unknown_one(client, db_session):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "amina@example.com"})

    assert resp.status_code == 202
    assert resp.json() == {
        "message": "If that address has a proposal with us, a sign-in code is on its way."
    }


def test_a_wrong_code_is_401(client, db_session):
    client.post("/api/project-proposals/", json=_payload())
    client.post("/api/project-proposals/portal/request-code", json={"email": "amina@example.com"})

    resp = client.post("/api/project-proposals/portal/verify-code",
                       json={"email": "amina@example.com", "code": "000000"})

    assert resp.status_code == 401


# ── The dashboard ────────────────────────────────────────────────────

def test_the_portal_lists_only_the_signed_in_address_dossiers(client, auth_headers):
    mine = _submit_and_request_changes(client, auth_headers)
    client.post("/api/project-proposals/", json=_payload(email="someone-else@example.com"))
    headers = _sign_in(client, "amina@example.com")

    resp = client.get("/api/project-proposals/portal/me", headers=headers)

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [i["id"] for i in items] == [mine]
    assert items[0]["editable"] is True
    assert items[0]["decision_comment"] == "Detail the transport costs."
    assert items[0]["content"]["project_name"] == "Fresh Food Parcels"


def test_the_portal_never_exposes_internal_notes(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the costs.",
              "internal_note": "Applicant known to inflate budgets."},
        headers=auth_headers,
    )
    headers = _sign_in(client, "amina@example.com")

    body = client.get("/api/project-proposals/portal/me", headers=headers).text

    assert "inflate budgets" not in body
    assert "internal_note" not in body
    assert "submitted_ip" not in body


def test_the_dashboard_needs_a_portal_token(client):
    assert client.get("/api/project-proposals/portal/me").status_code in (401, 403)


def test_a_staff_token_cannot_read_the_portal(client, auth_headers):
    resp = client.get("/api/project-proposals/portal/me", headers=auth_headers)

    assert resp.status_code == 401


def test_a_portal_token_cannot_reach_the_admin_endpoints(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    for path in ("/api/project-proposals/",
                 f"/api/project-proposals/{proposal_id}",
                 f"/api/project-proposals/{proposal_id}/versions/1",
                 f"/api/project-proposals/{proposal_id}/pdf"):
        assert client.get(path, headers=headers).status_code in (401, 403), path


# ── Revisions ────────────────────────────────────────────────────────

def test_a_revision_appends_a_version_and_reopens_the_dossier(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(
        f"/api/project-proposals/portal/{proposal_id}",
        json=_payload(project_name="Fresh Food Parcels (revised)"),
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["version_no"] == 2
    assert resp.json()["status"] == "submitted"
    assert resp.json()["editable"] is False

    detail = client.get(f"/api/project-proposals/{proposal_id}", headers=auth_headers).json()
    assert detail["project_name"] == "Fresh Food Parcels (revised)"
    assert detail["version_count"] == 2
    # Version 1 keeps the decision that caused the revision.
    assert detail["versions"][0]["decision"] == "changes_requested"
    assert detail["versions"][0]["decision_comment"] == "Detail the transport costs."
    assert detail["versions"][1]["decision"] is None


def test_a_revision_is_acknowledged_by_email(client, auth_headers, monkeypatch):
    import routers.proposal_portal as portal_module

    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")
    sent = []
    monkeypatch.setattr(portal_module.email_service, "send_proposal_received",
                        lambda **kwargs: sent.append(kwargs) or True)

    client.put(f"/api/project-proposals/portal/{proposal_id}", json=_payload(), headers=headers)

    assert len(sent) == 1
    assert sent[0]["version_no"] == 2


def test_a_revision_of_a_rejected_dossier_is_409(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "rejected", "decision_comment": "Out of scope."},
                 headers=auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{created['id']}",
                      json=_payload(), headers=headers)

    assert resp.status_code == 409


def test_a_revision_of_an_approved_dossier_is_409(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "approved"}, headers=auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{created['id']}",
                      json=_payload(), headers=headers)

    assert resp.status_code == 409


def test_a_revision_cannot_move_the_dossier_to_another_email(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{proposal_id}",
                      json=_payload(email="attacker@example.com"), headers=headers)

    assert resp.status_code == 200
    detail = client.get(f"/api/project-proposals/{proposal_id}", headers=auth_headers).json()
    assert detail["email"] == "amina@example.com"


def test_someone_elses_dossier_is_a_404_not_a_403(client, auth_headers):
    """404 on purpose: a 403 would confirm the dossier exists."""
    mine = _submit_and_request_changes(client, auth_headers)
    theirs = client.post(
        "/api/project-proposals/", json=_payload(email="someone-else@example.com")
    ).json()["id"]
    headers = _sign_in(client, "amina@example.com")

    assert mine != theirs
    assert client.put(f"/api/project-proposals/portal/{theirs}",
                      json=_payload(), headers=headers).status_code == 404


def test_an_incomplete_revision_is_refused(client, auth_headers):
    """A revision is validated by the same schema as a first submission, so it
    can never be less complete than the original."""
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{proposal_id}",
                      json=_payload(project_description="too short"), headers=headers)

    assert resp.status_code == 422


def test_request_code_is_indistinguishable_for_known_and_unknown_addresses(client, db_session):
    """Three posts must not reveal whether an address has applied for funding."""
    from proposal_otp import MAX_CODES_PER_EMAIL

    client.post("/api/project-proposals/", json=_payload())

    known, unknown = [], []
    for _ in range(MAX_CODES_PER_EMAIL + 2):
        known.append(client.post("/api/project-proposals/portal/request-code",
                                 json={"email": "amina@example.com"}))
        unknown.append(client.post("/api/project-proposals/portal/request-code",
                                   json={"email": "nobody-here@example.com"}))

    assert [r.status_code for r in known] == [r.status_code for r in unknown]
    assert {r.status_code for r in known} == {202}
    assert [r.json() for r in known] == [r.json() for r in unknown]


def test_a_rate_limited_address_is_told_nothing_and_emailed_nothing(client, db_session, monkeypatch):
    import routers.proposal_portal as portal_module
    from proposal_otp import MAX_CODES_PER_EMAIL

    sent = []
    monkeypatch.setattr(portal_module.email_service, "send_proposal_access_code",
                        lambda **kwargs: sent.append(kwargs) or True)
    client.post("/api/project-proposals/", json=_payload())

    for _ in range(MAX_CODES_PER_EMAIL + 1):
        resp = client.post("/api/project-proposals/portal/request-code",
                           json={"email": "amina@example.com"})
        assert resp.status_code == 202

    assert len(sent) == MAX_CODES_PER_EMAIL, "the capped request must not send a code"
