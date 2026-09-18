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

    Task 5 hands it a ProposalVersion; today the router hands it a
    ProjectProposal. Both work, which is what lets the move be behaviour-free.
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
