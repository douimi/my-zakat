"""Unread tracking, the funding agreement, and the PDF it renders.

Three features that share a deploy and one risk: each of them is a thing the
reviewer trusts without being able to check it by eye. An unread badge that
under-counts means a revised application sits unseen; an agreement pre-fill that
silently guesses a distribution figure means a wrong number in a document that
commits money and gets signed.
"""
import io

import pytest

import proposal_service as svc
from agreement_pdf import render_agreement_pdf
from models import ProjectProposal, ProposalAgreement, ProposalVersion


def _content(**overrides) -> dict:
    base = {
        "full_name": "Naji Abu Raida",
        "national_id": "ID-90210",
        "date_of_birth_year": 1992,
        "place_of_residence": "Khan Younis",
        "mobile_number": "+970700000000",
        "email": "naji@example.com",
        "educational_level": "BSc Agriculture",
        "project_name": "Distribution of Rice and Potatoes",
        "project_description": "Food parcels for displaced families.",
        "problem_solved": "Families cannot afford staples.",
        "target_beneficiaries": "50 displaced families",
        "community_impact": "Local suppliers are used.",
        "expected_impact": "Better nutrition.",
        "implementation_steps": "Identify families\nBuy supplies\nDistribute",
        # Deliberately multi-line: the agreement header needs ONE line.
        "implementation_location": "Al-Mawasi, Khan Younis, Gaza\nnear the coastal road",
        "required_materials": "Purchase of rice and potatoes\nPackaging\nTransport",
        "expected_duration": "Two weeks after funding",
        "continuity_plan": "Local committee takes over.",
        "feasibility": "Suppliers quoted.",
        "expected_challenges": "Crowding",
        "number_of_beneficiaries": 50,
        "cost_per_unit_usd": 90.0,
        "unit_type": "family",
        "additional_expenses_usd": 0.0,
        "additional_expenses_description": None,
        "total_amount_usd": 4500.0,
    }
    base.update(overrides)
    return base


@pytest.fixture
def dossier(db_session):
    """An approved dossier on version 1."""
    d = ProjectProposal(
        email="naji@example.com", full_name="Naji Abu Raida", status="approved")
    db_session.add(d)
    db_session.flush()
    v = ProposalVersion(proposal_id=d.id, version_no=1, **_content())
    db_session.add(v)
    db_session.flush()
    d.current_version_id = v.id
    db_session.commit()
    db_session.refresh(d)
    return d


def _add_version(db_session, d, no, **overrides):
    v = ProposalVersion(proposal_id=d.id, version_no=no, **_content(**overrides))
    db_session.add(v)
    db_session.flush()
    d.current_version_id = v.id
    db_session.commit()
    db_session.refresh(d)
    return v


# ======================================================================
# Unread tracking
# ======================================================================

def test_a_fresh_dossier_is_unread(dossier):
    assert svc.is_unread(dossier) is True


def test_marking_seen_clears_it(db_session, dossier):
    assert svc.mark_seen(db_session, dossier) is True
    assert svc.is_unread(dossier) is False


def test_marking_seen_twice_reports_no_change(db_session, dossier):
    svc.mark_seen(db_session, dossier)
    assert svc.mark_seen(db_session, dossier) is False, (
        "a re-open must not be reported as a change, or it logs on every click")


def test_a_revision_makes_it_unread_again(db_session, dossier):
    svc.mark_seen(db_session, dossier)
    _add_version(db_session, dossier, 2)
    assert svc.is_unread(dossier) is True, (
        "the whole point: a dossier the reviewer has read, changed underneath them")


def test_marking_seen_does_not_touch_updated_at(db_session, dossier):
    """Reading is not a change. Bumping updated_at would reorder the admin list
    under the reviewer as they clicked through it."""
    before = dossier.updated_at
    svc.mark_seen(db_session, dossier)
    assert dossier.updated_at == before


def test_a_dossier_with_no_version_is_not_unread(db_session):
    """Nothing to read; listing it would send the reviewer to an empty drawer."""
    d = ProjectProposal(email="x@y.z", full_name="X", status="submitted")
    db_session.add(d)
    db_session.commit()
    assert svc.is_unread(d) is False
    assert svc.mark_seen(db_session, d) is False


def test_unread_count_matches_the_unread_dossiers(db_session, dossier):
    other = ProjectProposal(email="b@c.d", full_name="B", status="submitted")
    db_session.add(other)
    db_session.flush()
    v = ProposalVersion(proposal_id=other.id, version_no=1, **_content())
    db_session.add(v)
    db_session.flush()
    other.current_version_id = v.id
    db_session.commit()

    assert svc.unread_count(db_session) == 2
    svc.mark_seen(db_session, dossier)
    assert svc.unread_count(db_session) == 1
    svc.mark_seen(db_session, other)
    assert svc.unread_count(db_session) == 0


# ======================================================================
# Agreement pre-fill
# ======================================================================

def test_draft_prefills_what_maps_cleanly(db_session, dossier):
    draft = svc.agreement_draft(dossier, svc.current_version(db_session, dossier))
    assert draft["project_title"] == "Distribution of Rice and Potatoes"
    assert draft["field_representative"] == "Naji Abu Raida"
    assert draft["approved_funding_usd"] == 4500.0
    assert draft["target_count"] == 50


def test_draft_takes_only_the_first_line_of_the_location(db_session, dossier):
    """Applicants write a paragraph; the agreement header has one line for it."""
    draft = svc.agreement_draft(dossier, svc.current_version(db_session, dossier))
    assert draft["location"] == "Al-Mawasi, Khan Younis, Gaza"
    assert "\n" not in draft["location"]


def test_draft_leaves_the_distribution_lines_blank(db_session, dossier):
    """They cannot be derived from any submitted field, and the document quotes
    them again in sections 3, 4 and 7 -- a guess would propagate."""
    draft = svc.agreement_draft(dossier, svc.current_version(db_session, dossier))
    assert draft["distribution_per_beneficiary"] == ""
    assert draft["total_planned_distribution"] == ""


@pytest.mark.parametrize("unit,count,expected", [
    ("family", 50, "families"),
    ("family", 1, "family"),
    ("person", 30, "persons"),
    ("families", 50, "families"),   # already plural, left alone
    ("", 50, "beneficiaries"),      # nothing submitted
])
def test_draft_pluralises_the_target_label(db_session, dossier, unit, count, expected):
    v = svc.current_version(db_session, dossier)
    v.unit_type = unit
    v.number_of_beneficiaries = count
    db_session.commit()
    assert svc.agreement_draft(dossier, v)["target_label"] == expected


@pytest.mark.parametrize("unit,count,expected", [
    (None, 50, "beneficiaries"),
    ("  ", 50, "beneficiaries"),
    ("day", 7, "days"),
    ("day", 1, "day"),
])
def test_pluralise_handles_what_the_column_cannot_hold(unit, count, expected):
    """unit_type is NOT NULL in the database, so None can only arrive from a
    caller rather than a row -- tested against the helper directly."""
    assert svc._pluralise(unit, count) == expected


def test_draft_for_a_dossier_with_no_version_is_empty(dossier):
    draft = svc.agreement_draft(dossier, None)
    assert set(draft) == set(svc.AGREEMENT_FIELDS)
    assert all(v == "" for v in draft.values())


# ======================================================================
# Saving the agreement
# ======================================================================

def test_an_unapproved_proposal_cannot_have_an_agreement(db_session, dossier):
    """The one gate that must not be bypassable: an agreement commits funds."""
    for status in ("submitted", "under_review", "changes_requested", "rejected"):
        dossier.status = status
        db_session.commit()
        with pytest.raises(svc.ProposalNotApproved):
            svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)


def test_saving_creates_from_the_draft_then_overlays_the_payload(db_session, dossier):
    a = svc.save_agreement(
        db_session, dossier,
        fields={"distribution_per_beneficiary": "10 kg rice + 10 kg potatoes",
                "total_planned_distribution": "500 kg rice + 500 kg potatoes"},
        reviewer_id=1,
    )
    # Overlaid
    assert a.distribution_per_beneficiary == "10 kg rice + 10 kg potatoes"
    # From the draft, even though the payload never mentioned them
    assert a.project_title == "Distribution of Rice and Potatoes"
    assert a.target_label == "families"
    assert float(a.approved_funding_usd) == 4500.0


def test_saving_records_which_version_it_was_drawn_from(db_session, dossier):
    a = svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    assert a.version_id == dossier.current_version_id


def test_a_later_revision_leaves_the_agreement_pointing_at_the_old_version(
    db_session, dossier
):
    """So the admin can SEE that the contract no longer matches what is current,
    rather than the contract silently changing under a signed agreement."""
    a = svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    drawn_from = a.version_id
    dossier.status = "changes_requested"
    db_session.commit()
    _add_version(db_session, dossier, 2, project_name="Something else entirely")
    db_session.refresh(a)
    assert a.version_id == drawn_from != dossier.current_version_id
    assert a.project_title == "Distribution of Rice and Potatoes"


def test_a_second_save_updates_rather_than_duplicating(db_session, dossier):
    svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    svc.save_agreement(
        db_session, dossier, fields={"approved_funding_usd": 4000}, reviewer_id=2)
    rows = db_session.query(ProposalAgreement).filter(
        ProposalAgreement.proposal_id == dossier.id).all()
    assert len(rows) == 1
    assert float(rows[0].approved_funding_usd) == 4000.0
    assert rows[0].updated_by == 2


def test_a_required_field_cannot_be_blanked(db_session, dossier):
    svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    with pytest.raises(svc.AgreementIncomplete):
        svc.save_agreement(
            db_session, dossier, fields={"project_title": "   "}, reviewer_id=1)


@pytest.mark.parametrize("field,value", [
    ("approved_funding_usd", "not a number"),
    ("approved_funding_usd", -5),
    ("target_count", 0),
    ("target_count", "many"),
])
def test_bad_numbers_are_refused(db_session, dossier, field, value):
    with pytest.raises(svc.AgreementIncomplete):
        svc.save_agreement(db_session, dossier, fields={field: value}, reviewer_id=1)


def test_unknown_fields_never_reach_the_orm(db_session, dossier):
    a = svc.save_agreement(
        db_session, dossier,
        fields={"status": "approved", "id": 999, "proposal_id": 12345},
        reviewer_id=1,
    )
    assert a.proposal_id == dossier.id
    assert a.id != 999


def test_issued_at_is_stamped_once_only(db_session, dossier):
    a = svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    assert a.issued_at is None
    assert svc.mark_agreement_issued(db_session, a) is True
    first = a.issued_at
    assert first is not None
    assert svc.mark_agreement_issued(db_session, a) is False
    assert a.issued_at == first, (
        "issued_at answers 'has this gone out', not 'when was it last clicked'")


# ======================================================================
# The PDF
# ======================================================================

@pytest.fixture
def agreement(db_session, dossier):
    return svc.save_agreement(
        db_session, dossier,
        fields={"distribution_per_beneficiary": "10 kg rice + 10 kg potatoes",
                "total_planned_distribution": "500 kg rice + 500 kg potatoes"},
        reviewer_id=1,
    )


def _text(pdf_bytes) -> str:
    pdfplumber = pytest.importorskip("pdfplumber")
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
        return "\n".join((p.extract_text() or "") for p in doc.pages)


def test_the_pdf_renders(agreement):
    pdf = render_agreement_pdf(agreement)
    assert pdf.startswith(b"%PDF"), "not a PDF"
    assert len(pdf) > 5000


def test_the_pdf_carries_every_header_field(agreement):
    body = _text(render_agreement_pdf(agreement))
    for expected in (
        "MyZakat Project #%s" % agreement.proposal_id,
        "Funding & Implementation Agreement",
        "Distribution of Rice and Potatoes",
        "Al-Mawasi, Khan Younis, Gaza",
        "Naji Abu Raida",
        "$4,500 USD",
        "50 families",
        "10 kg rice + 10 kg potatoes",
        "500 kg rice + 500 kg potatoes",
    ):
        assert expected in body, "missing from the agreement: %r" % expected


def test_the_pdf_has_all_eight_sections(agreement):
    body = _text(render_agreement_pdf(agreement))
    for heading in (
        "1. Purpose", "2. Use of Funds", "3. Required Distribution",
        "4. Beneficiary Selection", "5. Financial Documentation",
        "6. Project Documentation", "7. Final Report", "8. Acknowledgment",
    ):
        assert heading in body, "missing section: %r" % heading


def test_the_pdf_has_both_signature_blocks_unsigned(agreement):
    body = _text(render_agreement_pdf(agreement))
    assert "Naser Hdieb" in body and "Chairperson" in body
    assert "Field Representative" in body
    # Two name lines, two signature lines, two date lines — left blank to sign.
    assert body.count("Signature: _") == 2
    assert body.count("Date: _") == 2


def test_the_figures_agree_with_themselves_throughout(agreement):
    """The target count is quoted in the header and again in sections 1, 3, 4,
    6 and 7. Deriving it per section is how those drift apart."""
    body = _text(render_agreement_pdf(agreement))
    assert body.count("50 families") >= 3
    assert "all 50 families" in body


def test_blank_distribution_lines_are_omitted_not_printed_empty(db_session, dossier):
    """A project handing out one indivisible thing per beneficiary has nothing
    to put there; the document must not show a dangling label."""
    a = svc.save_agreement(db_session, dossier, fields={}, reviewer_id=1)
    body = _text(render_agreement_pdf(a))
    assert "Distribution per Beneficiary" not in body
    assert "Total Planned Distribution" not in body
    assert "3. Required Distribution" in body   # the section itself survives


def test_the_footer_and_header_appear_on_every_page(agreement):
    pdfplumber = pytest.importorskip("pdfplumber")
    with pdfplumber.open(io.BytesIO(render_agreement_pdf(agreement))) as doc:
        assert len(doc.pages) >= 2
        for i, page in enumerate(doc.pages, 1):
            text = page.extract_text() or ""
            assert "Zakat Distribution Foundation" in text, "page %d header" % i
            assert "P.O. Box 2250" in text, "page %d footer" % i


def test_money_renders_without_stray_cents(db_session, dossier):
    a = svc.save_agreement(
        db_session, dossier, fields={"approved_funding_usd": 4500}, reviewer_id=1)
    assert "$4,500 USD" in _text(render_agreement_pdf(a))
    a.approved_funding_usd = 4500.5
    db_session.commit()
    assert "$4,500.50 USD" in _text(render_agreement_pdf(a))


def test_angle_brackets_in_content_cannot_break_the_pdf(db_session, dossier):
    """reportlab's Paragraph parses a mini-markup; an unescaped '<' in a project
    title would raise and take the contract with it."""
    a = svc.save_agreement(
        db_session, dossier,
        fields={"project_title": "Rice <b> & Potatoes </i> <notatag>"},
        reviewer_id=1,
    )
    pdf = render_agreement_pdf(a)
    assert pdf.startswith(b"%PDF")
    assert "notatag" in _text(pdf)


# ======================================================================
# The HTTP surface
#
# The endpoints are thin wrappers over the service functions above, so these
# cover wiring and status codes rather than re-testing the domain rules: route
# ordering, the auth gate, and that a refusal comes back as the right code
# instead of a 500.
# ======================================================================

def _api(client, headers, method, path, **kw):
    return getattr(client, method)(
        "/api/project-proposals%s" % path, headers=headers, **kw)


def test_unread_count_is_not_captured_by_the_id_route(client, auth_headers, dossier):
    """/unread-count has to be declared before /{proposal_id}, or FastAPI maps
    it onto the int path parameter and answers 422."""
    r = _api(client, auth_headers, "get", "/unread-count")
    assert r.status_code == 200, r.text
    assert r.json()["count"] >= 1


def test_marking_seen_drops_the_count(client, auth_headers, dossier):
    before = _api(client, auth_headers, "get", "/unread-count").json()["count"]
    r = _api(client, auth_headers, "post", "/%d/seen" % dossier.id)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_unread"] is False
    assert body["unread_count"] == before - 1


def test_marking_seen_twice_is_idempotent(client, auth_headers, dossier):
    _api(client, auth_headers, "post", "/%d/seen" % dossier.id)
    r = _api(client, auth_headers, "post", "/%d/seen" % dossier.id)
    assert r.status_code == 200
    assert r.json()["is_unread"] is False


def test_the_list_marks_which_rows_are_unread(client, auth_headers, dossier):
    rows = _api(client, auth_headers, "get", "/").json()["items"]
    row = next(r for r in rows if r["id"] == dossier.id)
    assert row["is_unread"] is True
    assert row["is_revision"] is False     # version 1 only


def test_agreement_endpoint_returns_a_draft_before_one_exists(
    client, auth_headers, dossier
):
    r = _api(client, auth_headers, "get", "/%d/agreement" % dossier.id)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["exists"] is False
    assert body["agreement"]["project_title"] == "Distribution of Rice and Potatoes"
    assert body["agreement"]["distribution_per_beneficiary"] == ""


def test_put_then_get_round_trips_the_agreement(client, auth_headers, dossier):
    r = _api(client, auth_headers, "put", "/%d/agreement" % dossier.id, json={
        "distribution_per_beneficiary": "10 kg rice + 10 kg potatoes",
        "total_planned_distribution": "500 kg rice + 500 kg potatoes",
        "approved_funding_usd": 4500,
    })
    assert r.status_code == 200, r.text
    assert r.json()["exists"] is True

    body = _api(client, auth_headers, "get", "/%d/agreement" % dossier.id).json()
    assert body["exists"] is True
    assert body["agreement"]["distribution_per_beneficiary"] == "10 kg rice + 10 kg potatoes"
    assert body["agreement"]["issued_at"] is None


def test_an_unapproved_proposal_gets_409_not_500(
    client, auth_headers, dossier, db_session
):
    dossier.status = "submitted"
    db_session.commit()
    r = _api(client, auth_headers, "put", "/%d/agreement" % dossier.id, json={})
    assert r.status_code == 409, r.text


def test_a_bad_amount_gets_422_from_the_schema(client, auth_headers, dossier):
    r = _api(client, auth_headers, "put", "/%d/agreement" % dossier.id,
             json={"approved_funding_usd": -1})
    assert r.status_code == 422, r.text


def test_the_pdf_is_404_until_an_agreement_is_saved(client, auth_headers, dossier):
    r = _api(client, auth_headers, "get", "/%d/agreement/pdf" % dossier.id)
    assert r.status_code == 404, r.text


def test_downloading_the_pdf_stamps_it_issued(client, auth_headers, dossier):
    _api(client, auth_headers, "put", "/%d/agreement" % dossier.id, json={})
    r = _api(client, auth_headers, "get", "/%d/agreement/pdf" % dossier.id)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"]
    assert r.content.startswith(b"%PDF")

    body = _api(client, auth_headers, "get", "/%d/agreement" % dossier.id).json()
    assert body["agreement"]["issued_at"] is not None


def test_version_drift_is_reported(client, auth_headers, dossier, db_session):
    """An agreement drawn from v1 while the dossier has moved to v2 must say so,
    or a signed contract quietly stops matching what was approved."""
    _api(client, auth_headers, "put", "/%d/agreement" % dossier.id, json={})
    assert _api(client, auth_headers, "get",
                "/%d/agreement" % dossier.id).json()["version_drifted"] is False

    dossier.status = "changes_requested"
    db_session.commit()
    _add_version(db_session, dossier, 2)

    body = _api(client, auth_headers, "get", "/%d/agreement" % dossier.id).json()
    assert body["version_drifted"] is True


@pytest.mark.parametrize("method,path", [
    ("get", "/unread-count"),
    ("post", "/1/seen"),
    ("get", "/1/agreement"),
    ("put", "/1/agreement"),
    ("get", "/1/agreement/pdf"),
])
def test_every_new_endpoint_requires_auth(client, method, path):
    r = getattr(client, method)("/api/project-proposals%s" % path)
    assert r.status_code in (401, 403), "%s %s is unauthenticated!" % (method, path)
