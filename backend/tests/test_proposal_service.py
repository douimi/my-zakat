"""Dossier / version domain rules, independent of HTTP."""
import pytest
from datetime import datetime

from models import ProjectProposal, ProposalVersion
from tests.test_project_proposals import _content


def test_create_proposal_opens_a_dossier_and_version_one(db_session):
    from proposal_service import create_proposal

    dossier, version = create_proposal(
        db_session, content=_content(), submitted_ip="203.0.113.9",
        sms_consent=False, sms_consent_text=None,
    )

    assert dossier.status == "submitted"
    assert dossier.email == "amina@example.com"
    assert dossier.full_name == "Amina Yusuf"
    assert dossier.current_version_id == version.id
    assert version.version_no == 1
    assert version.project_name == "Fresh Food Parcels"
    assert version.submitted_ip == "203.0.113.9"
    assert version.decision is None


def test_consent_text_is_discarded_when_the_box_was_not_ticked(db_session):
    from proposal_service import create_proposal

    _, version = create_proposal(
        db_session, content=_content(), submitted_ip="",
        sms_consent=False, sms_consent_text="I agree to SMS",
    )

    assert version.sms_consent is False
    assert version.sms_consent_text is None
    assert version.sms_consent_at is None


def test_consent_is_stamped_when_the_box_was_ticked(db_session):
    from proposal_service import create_proposal

    _, version = create_proposal(
        db_session, content=_content(), submitted_ip="",
        sms_consent=True, sms_consent_text="I agree to SMS",
    )

    assert version.sms_consent is True
    assert version.sms_consent_text == "I agree to SMS"
    assert isinstance(version.sms_consent_at, datetime)


def test_add_revision_appends_a_version_and_reopens_the_dossier(db_session, admin_user):
    from proposal_service import add_revision, create_proposal, record_decision

    dossier, v1 = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="changes_requested",
        decision_comment="Please detail the transport costs.",
        internal_note="Budget looks padded.", reviewer_id=admin_user.id,
    )

    v2 = add_revision(
        db_session, dossier,
        content=_content(project_name="Fresh Food Parcels v2", total_amount_usd=4600.0,
                         additional_expenses_usd=600.0),
        submitted_ip="203.0.113.10", sms_consent=False, sms_consent_text=None,
    )

    assert v2.version_no == 2
    assert dossier.current_version_id == v2.id
    assert dossier.status == "submitted"
    assert dossier.full_name == "Amina Yusuf"
    # v1 keeps the decision that caused this revision, untouched.
    db_session.refresh(v1)
    assert v1.decision == "changes_requested"
    assert v1.decision_comment == "Please detail the transport costs."
    assert v1.project_name == "Fresh Food Parcels"


def test_a_revision_cannot_change_the_dossier_email(db_session, admin_user):
    from proposal_service import add_revision, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="changes_requested", decision_comment="Fix it",
        internal_note=None, reviewer_id=admin_user.id,
    )

    v2 = add_revision(
        db_session, dossier, content=_content(email="attacker@example.com"),
        submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    assert v2.email == "amina@example.com"
    assert dossier.email == "amina@example.com"


def test_add_revision_refuses_a_dossier_that_is_not_awaiting_changes(db_session, admin_user):
    from proposal_service import ProposalNotEditable, add_revision, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="rejected", decision_comment="Out of scope.",
        internal_note=None, reviewer_id=admin_user.id,
    )

    with pytest.raises(ProposalNotEditable):
        add_revision(db_session, dossier, content=_content(), submitted_ip="",
                     sms_consent=False, sms_consent_text=None)


def test_record_decision_writes_on_the_current_version(db_session, admin_user):
    from proposal_service import create_proposal, record_decision

    dossier, v1 = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    version = record_decision(
        db_session, dossier, status="approved", decision_comment="Funded in full.",
        internal_note="Cross-checked the quotes.", reviewer_id=admin_user.id,
    )

    assert version.id == v1.id
    assert version.decision == "approved"
    assert version.decision_comment == "Funded in full."
    assert version.internal_note == "Cross-checked the quotes."
    assert version.decided_by == admin_user.id
    assert isinstance(version.decided_at, datetime)
    assert dossier.status == "approved"
    assert dossier.reviewed_by == admin_user.id


def test_a_rejection_or_change_request_needs_a_comment_for_the_submitter(db_session, admin_user):
    from proposal_service import DecisionCommentRequired, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    for closing_status in ("rejected", "changes_requested"):
        with pytest.raises(DecisionCommentRequired):
            record_decision(db_session, dossier, status=closing_status,
                            decision_comment="   ", internal_note=None,
                            reviewer_id=admin_user.id)


def test_saving_an_internal_note_alone_preserves_the_submitter_comment(db_session, admin_user):
    """The admin drawer's "save notes" path: same status, no new comment."""
    from proposal_service import create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note=None, reviewer_id=admin_user.id)

    version = record_decision(db_session, dossier, status="changes_requested",
                              decision_comment=None, internal_note="Chased by phone too.",
                              reviewer_id=admin_user.id)

    assert version.decision_comment == "Detail the transport costs."
    assert version.internal_note == "Chased by phone too."


def test_an_unknown_status_is_refused(db_session, admin_user):
    from proposal_service import InvalidProposalStatus, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    with pytest.raises(InvalidProposalStatus):
        record_decision(db_session, dossier, status="archived", decision_comment="x",
                        internal_note=None, reviewer_id=admin_user.id)


def test_admin_serialization_flattens_the_current_version_and_lists_history(db_session, admin_user):
    from proposal_service import (
        add_revision, create_proposal, current_version, record_decision, serialize_for_admin,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="198.51.100.1",
        sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note="Budget looks padded.", reviewer_id=admin_user.id)
    add_revision(db_session, dossier, content=_content(project_name="Parcels v2"),
                 submitted_ip="198.51.100.2", sms_consent=False, sms_consent_text=None)

    out = serialize_for_admin(dossier, current_version(db_session, dossier), db=db_session)

    assert out["project_name"] == "Parcels v2"          # flattened current content
    assert out["status"] == "submitted"
    assert out["version_count"] == 2
    assert out["current_version_no"] == 2
    assert [v["version_no"] for v in out["versions"]] == [1, 2]
    assert out["versions"][0]["decision"] == "changes_requested"
    assert out["versions"][0]["internal_note"] == "Budget looks padded."
    assert out["versions"][1]["decision"] is None
    assert out["submitted_ip"] == "198.51.100.2"


def test_portal_serialization_hides_staff_only_fields(db_session, admin_user):
    from proposal_service import (
        create_proposal, current_version, record_decision, serialize_for_portal,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="198.51.100.1",
        sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note="Budget looks padded.", reviewer_id=admin_user.id)

    out = serialize_for_portal(dossier, current_version(db_session, dossier))

    assert out["editable"] is True
    assert out["decision_comment"] == "Detail the transport costs."
    assert out["content"]["project_name"] == "Fresh Food Parcels"
    for leaked in ("internal_note", "submitted_ip", "reviewed_by", "decided_by", "versions"):
        assert leaked not in out, f"{leaked} must never reach the submitter"
    assert "internal_note" not in out["content"]


def test_only_a_change_request_makes_a_dossier_editable(db_session, admin_user):
    from proposal_service import (
        create_proposal, current_version, record_decision, serialize_for_portal,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    for status, editable in (
        ("submitted", False), ("under_review", False),
        ("approved", False), ("rejected", False), ("changes_requested", True),
    ):
        record_decision(db_session, dossier, status=status, decision_comment="Reason given.",
                        internal_note=None, reviewer_id=admin_user.id)
        out = serialize_for_portal(dossier, current_version(db_session, dossier))
        assert out["editable"] is editable, status


def test_versions_for_many_dossiers_load_in_one_query(db_session):
    from proposal_service import create_proposal, versions_by_proposal

    first, v1 = create_proposal(db_session, content=_content(), submitted_ip="",
                                sms_consent=False, sms_consent_text=None)
    second, v2 = create_proposal(db_session, content=_content(email="b@example.com"),
                                 submitted_ip="", sms_consent=False, sms_consent_text=None)

    grouped = versions_by_proposal(db_session, [first.id, second.id])

    assert [v.id for v in grouped[first.id]] == [v1.id]
    assert [v.id for v in grouped[second.id]] == [v2.id]
    assert grouped.get(99999, []) == []
