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
    assert "my-proposals" not in text, "a closed dossier must not invite an edit"


def test_the_access_code_email_shows_the_code_and_its_lifetime():
    html, text = render("proposal_access_code", {"code": "483920", "ttl_minutes": 10})

    assert "483920" in html and "483920" in text
    assert "10" in text


def test_the_access_code_email_names_no_applicant_or_project():
    """It is sent before we know the requester controls the address.

    Confirming "yes, Amina Yusuf has a proposal here" to whoever typed the
    address would hand an unverified requester the applicant's name and
    project -- far more than the 404 on /portal/request-code discloses. The
    values below are deliberately IN the context: the guarantee is that the
    template does not reference them, not that the caller withholds them.
    """
    html, text = render("proposal_access_code", {
        "code": "483920",
        "ttl_minutes": 10,
        "name": "Amina Yusuf",
        "project_name": "Secret Wells Project",
        "proposal_id": 42,
    })

    for leaked in ("Amina Yusuf", "Secret Wells Project", "#42"):
        assert leaked not in html, f"{leaked} must not reach an unverified address"
        assert leaked not in text, f"{leaked} must not reach an unverified address"
    assert "483920" in html and "483920" in text


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


def test_a_multi_line_reviewer_comment_survives_in_both_variants():
    """An admin writing a numbered list must not be delivered a run-on sentence."""
    comment = "Please do three things:\n1. Itemise transport\n2. Attach the quote\n3. Name the committee"
    html, text = render("proposal_changes_requested", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": comment,
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "1. Itemise transport" in text and "3. Name the committee" in text
    assert "1. Itemise transport" in html
    # Without pre-wrap the client collapses the newlines into one paragraph.
    assert "pre-wrap" in html


def test_an_applicants_html_in_a_project_name_is_escaped():
    """project_name comes from a public, unauthenticated form."""
    html, _ = render("proposal_received", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "<script>alert(1)</script>",
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
