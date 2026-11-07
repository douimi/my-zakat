"""Resending a dossier's status email by hand, and the history shown before it."""
import pytest

import email_service
import proposal_service as svc
from marketing.compliance import suppress_email
from models import EmailOutbox
from tests.test_proposal_reports_api import APPLICANT, _dossier

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"

SENDERS = (
    "send_proposal_received", "send_proposal_changes_requested",
    "send_proposal_rejected", "send_proposal_approved", "send_proposal_funded",
    "send_report_received", "send_report_changes_requested", "send_proposal_completed",
)


@pytest.fixture
def sent(monkeypatch):
    calls = []
    for name in SENDERS:
        monkeypatch.setattr(
            email_service, name, lambda _n=name, **kw: calls.append((_n, kw)) or True)
    return calls


def _resend(client, headers, proposal_id):
    return client.post(
        "/api/project-proposals/%d/resend-notification" % proposal_id, headers=headers)


# ── Which email goes out ─────────────────────────────────────────────

def test_a_funded_dossier_gets_the_funding_email_again(client, auth_headers, db_session, sent):
    dossier = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)

    r = _resend(client, auth_headers, dossier.id)

    assert r.status_code == 200, r.text
    assert r.json()["to"] == APPLICANT
    [(name, kwargs)] = sent
    assert name == "send_proposal_funded"
    assert kwargs["proposal_id"] == dossier.id
    assert kwargs["version_no"] == 1
    assert kwargs["resend_tag"], "a resend must carry its own idempotency key"


def test_a_change_request_is_resent_with_the_reviewers_comment(
    client, auth_headers, db_session, sent
):
    dossier = _dossier(db_session, status="submitted")
    version = svc.current_version(db_session, dossier)
    version.decision_comment = "Detail the transport costs."
    dossier.status = "changes_requested"
    db_session.commit()

    assert _resend(client, auth_headers, dossier.id).status_code == 200
    [(name, kwargs)] = sent
    assert name == "send_proposal_changes_requested"
    assert kwargs["comment"] == "Detail the transport costs."


def test_under_review_resends_the_acknowledgement(client, auth_headers, db_session, sent):
    dossier = _dossier(db_session, status="under_review")
    assert _resend(client, auth_headers, dossier.id).status_code == 200
    assert [name for name, _ in sent] == ["send_proposal_received"]
    assert "comment" not in sent[0][1]


def test_a_report_sent_back_is_resent_with_its_number_and_reason(
    client, auth_headers, db_session, sent
):
    dossier = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    svc.submit_report(db_session, dossier, narrative="Done.", submitted_ip=None)
    svc.record_report_decision(db_session, dossier, decision="changes_requested",
                      decision_comment="Add the invoices.", internal_note=None,
                      reviewer_id=1)

    assert _resend(client, auth_headers, dossier.id).status_code == 200
    [(name, kwargs)] = sent
    assert name == "send_report_changes_requested"
    assert kwargs["report_no"] == 1
    assert kwargs["comment"] == "Add the invoices."


# ── Refusals ─────────────────────────────────────────────────────────

def test_a_suppressed_address_is_refused_not_silently_skipped(
    client, auth_headers, db_session, sent
):
    dossier = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    suppress_email(db_session, APPLICANT, reason="bounce")

    r = _resend(client, auth_headers, dossier.id)

    assert r.status_code == 409
    assert "suppression list" in r.json()["detail"]
    assert sent == []


def test_a_queueing_failure_is_reported(client, auth_headers, db_session, monkeypatch):
    dossier = svc.mark_funded(db_session, _dossier(db_session), reviewer_id=1)
    monkeypatch.setattr(email_service, "send_proposal_funded", lambda **kw: False)
    assert _resend(client, auth_headers, dossier.id).status_code == 502


def test_resending_requires_a_manager_or_admin(
    client, field_staff_headers, db_session, sent
):
    dossier = _dossier(db_session)
    assert _resend(client, {}, dossier.id).status_code == 401
    assert _resend(client, field_staff_headers, dossier.id).status_code == 403
    assert sent == []


def test_resending_for_a_missing_dossier_is_404(client, auth_headers, sent):
    assert _resend(client, auth_headers, 999999).status_code == 404


# ── The idempotency key ──────────────────────────────────────────────

def test_a_resend_gets_its_own_key_and_the_original_keeps_its_own(monkeypatch):
    """Keys are unique in the outbox: reusing the original would be refused by
    the database, while two event-driven sends must still collapse to one."""
    keys = []
    monkeypatch.setattr(email_service, "_enqueue",
                        lambda slug, **kw: keys.append(kw["idempotency_key"]) or True)
    args = dict(email="a@example.com", name="A", proposal_id=7, version_no=1,
                project_name="P")

    email_service.send_proposal_funded(**args)
    email_service.send_proposal_funded(**args, resend_tag="aaa")
    email_service.send_proposal_funded(**args, resend_tag="bbb")

    assert keys == ["proposal-7-funded",
                    "proposal-7-funded-resend-aaa",
                    "proposal-7-funded-resend-bbb"]


def test_the_funding_email_links_straight_to_the_dossier(monkeypatch):
    from marketing.renderer import render
    contexts = []
    monkeypatch.setattr(email_service, "_enqueue",
                        lambda slug, **kw: contexts.append(kw["context"]) or True)
    email_service.send_proposal_funded(
        email="team@example.com", name="A", proposal_id=7, version_no=1, project_name="P")

    html, text = render("proposal_funded", contexts[0])
    for body in (html, text):
        assert "my-proposals?proposal=7" in body
        assert "team@example.com" in body, "the email must say which address signs in"
        assert "100 MB" in body


# ── History ──────────────────────────────────────────────────────────

def _outbox(db, *, slug, email=APPLICANT, proposal_id=None, status="sent", key=None):
    row = EmailOutbox(
        template_slug=slug, to_email=email, from_email="noreply@myzakat.org",
        subject="s-%s" % slug, body_html="<p>secret 123456</p>", body_text="secret 123456",
        context={"proposal_id": proposal_id, "code": "123456"} if proposal_id else {"code": "123456"},
        idempotency_key=key, status=status,
    )
    db.add(row)
    db.commit()
    return row


def test_the_history_shows_this_dossiers_emails_and_sign_in_codes(
    client, auth_headers, db_session
):
    dossier = _dossier(db_session)
    other = _dossier(db_session)  # same applicant, another dossier
    _outbox(db_session, slug="proposal_funded", proposal_id=dossier.id,
            key="proposal-%d-funded" % dossier.id)
    _outbox(db_session, slug="proposal_funded", proposal_id=dossier.id, status="failed",
            key="proposal-%d-funded-resend-abc" % dossier.id)
    _outbox(db_session, slug="proposal_approved", proposal_id=other.id)
    _outbox(db_session, slug="proposal_access_code")
    _outbox(db_session, slug="proposal_funded", email="someone@else.org",
            proposal_id=dossier.id)
    _outbox(db_session, slug="donation_receipt", proposal_id=dossier.id)

    r = client.get("/api/project-proposals/%d/notifications" % dossier.id, headers=auth_headers)

    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert sorted(i["template"] for i in items) == [
        "proposal_access_code", "proposal_funded", "proposal_funded"]
    assert sorted(i["resent"] for i in items) == [False, False, True]
    assert {i["status"] for i in items} == {"sent", "failed"}


def test_the_history_never_exposes_bodies_or_sign_in_codes(client, auth_headers, db_session):
    dossier = _dossier(db_session)
    _outbox(db_session, slug="proposal_access_code")
    r = client.get("/api/project-proposals/%d/notifications" % dossier.id, headers=auth_headers)
    assert "123456" not in r.text


def test_the_history_requires_a_manager_or_admin(client, field_staff_headers, db_session):
    dossier = _dossier(db_session)
    r = client.get("/api/project-proposals/%d/notifications" % dossier.id,
                   headers=field_staff_headers)
    assert r.status_code == 403
