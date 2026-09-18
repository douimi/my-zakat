"""Proposal notification templates actually render, with the right content."""
import pytest

from marketing.renderer import render


@pytest.mark.parametrize("slug", [
    "proposal_received",
    "proposal_changes_requested",
    "proposal_rejected",
    "proposal_approved",
    "proposal_access_code",
])
def test_every_template_pair_exists_and_renders(slug):
    html, text = render(slug, {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 2,
        "project_name": "Fresh Food Parcels",
        "comment": "Please detail the transport costs.",
        "portal_url": "https://myzakat.org/my-proposals",
        "code": "123456",
        "ttl_minutes": 10,
    })

    assert html.strip().startswith("<")
    assert text.strip()


def test_the_change_request_quotes_the_reviewer_and_links_the_portal():
    html, text = render("proposal_changes_requested", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": "Please detail the transport costs.",
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "Please detail the transport costs." in html
    assert "Please detail the transport costs." in text
    assert "my-proposals" in html
    assert "my-proposals" in text


def test_the_rejection_gives_the_reason_and_offers_no_edit_link():
    html, text = render("proposal_rejected", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": "Outside this funding cycle's scope.",
    })

    assert "Outside this funding cycle" in text
    assert "my-proposals" not in html, "a closed dossier must not invite an edit"


def test_the_access_code_email_shows_the_code_and_its_lifetime():
    html, text = render("proposal_access_code", {"code": "483920", "ttl_minutes": 10})

    assert "483920" in html and "483920" in text
    assert "10" in text


def test_the_access_code_email_names_no_applicant_or_project():
    """It is sent before we know the requester controls the address.

    Confirming "yes, Amina Yusuf has a proposal here" to whoever typed the
    address would leak exactly what /portal/request-code refuses to leak.
    """
    html, _ = render("proposal_access_code", {"code": "483920", "ttl_minutes": 10})

    assert "{{" not in html
    for leaked in ("project_name", "proposal_id"):
        assert leaked not in html


def test_the_shims_queue_one_email_each(monkeypatch):
    import email_service

    queued = []

    def fake_enqueue(slug, **kwargs):
        queued.append((slug, kwargs))
        return True

    monkeypatch.setattr(email_service, "_enqueue", fake_enqueue)

    assert email_service.send_proposal_received(
        email="a@example.com", name="Amina", proposal_id=42, version_no=1,
        project_name="Parcels",
    )
    assert email_service.send_proposal_changes_requested(
        email="a@example.com", name="Amina", proposal_id=42, version_no=1,
        project_name="Parcels", comment="Detail the costs.",
    )
    assert email_service.send_proposal_access_code(email="a@example.com", code="483920")

    assert [slug for slug, _ in queued] == [
        "proposal_received", "proposal_changes_requested", "proposal_access_code",
    ]
    # Every proposal email is keyed, so a double click cannot send twice.
    assert queued[0][1]["idempotency_key"] == "proposal-42-v1-received"
    assert queued[1][1]["idempotency_key"] == "proposal-42-v1-changes_requested"
    assert queued[1][1]["context"]["comment"] == "Detail the costs."
    assert queued[1][1]["context"]["portal_url"].endswith("/my-proposals")
    # The code email carries no key: every request must deliver a fresh code.
    assert "idempotency_key" not in queued[2][1]
    assert queued[2][1]["category"] == "transactional"
