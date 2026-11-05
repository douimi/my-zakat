"""The funded -> report -> completed lifecycle, and the rule it enforces.

The rule that matters commercially: a team that has been given money cannot ask
for more until it has accounted for the first grant. Everything here exists to
make sure that gate is real, has exactly one way through it, and cannot trap a
team with no way forward.
"""
import pytest

import proposal_service as svc
from models import ProjectProposal, ProposalReport, ProposalVersion


def _content(**overrides) -> dict:
    base = {
        "full_name": "Naji Abu Raida",
        "national_id": "ID-90210",
        "date_of_birth_year": 1992,
        "place_of_residence": "Khan Younis",
        "mobile_number": "+970700000000",
        "email": "naji@example.com",
        "educational_level": "BSc",
        "project_name": "Rice and Potatoes",
        "project_description": "Food parcels.",
        "problem_solved": "Hunger.",
        "target_beneficiaries": "50 families",
        "community_impact": "Local suppliers.",
        "expected_impact": "Nutrition.",
        "implementation_steps": "Buy\nDistribute",
        "implementation_location": "Al-Mawasi, Gaza",
        "required_materials": "Rice\nPotatoes",
        "expected_duration": "Two weeks",
        "continuity_plan": "Committee.",
        "feasibility": "Quoted.",
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


def _open_dossier(db, status="approved", email="naji@example.com"):
    d = ProjectProposal(email=email, full_name="Naji Abu Raida", status=status)
    db.add(d)
    db.flush()
    v = ProposalVersion(proposal_id=d.id, version_no=1, **_content(email=email))
    db.add(v)
    db.flush()
    d.current_version_id = v.id
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def approved(db_session):
    return _open_dossier(db_session)


@pytest.fixture
def funded(db_session, approved):
    return svc.mark_funded(db_session, approved, reviewer_id=1)


# ======================================================================
# approved -> funded
# ======================================================================

def test_funding_an_approved_proposal(db_session, approved):
    out = svc.mark_funded(db_session, approved, reviewer_id=7)
    assert out.status == svc.FUNDED
    assert out.reviewed_by == 7


@pytest.mark.parametrize("status", [
    "submitted", "under_review", "changes_requested", "rejected",
])
def test_only_an_approved_proposal_can_be_funded(db_session, status):
    d = _open_dossier(db_session, status=status)
    with pytest.raises(svc.InvalidProposalStatus):
        svc.mark_funded(db_session, d, reviewer_id=1)


def test_funding_twice_is_a_no_op_not_an_error(db_session, funded):
    """A double click must not re-date anything or raise in the admin's face."""
    before = funded.reviewed_at
    out = svc.mark_funded(db_session, funded, reviewer_id=99)
    assert out.status == svc.FUNDED
    assert out.reviewed_at == before
    assert out.reviewed_by != 99


def test_funded_is_not_reachable_through_the_review_endpoint(db_session, approved):
    """record_decision() handles verdicts on the application. Letting it set
    `funded` would bypass the 'only from approved' guard and stamp reviewed_at
    for a disbursement."""
    with pytest.raises(svc.InvalidProposalStatus) as err:
        svc.record_decision(db_session, approved, status=svc.FUNDED,
                            decision_comment=None, internal_note=None, reviewer_id=1)
    assert "not a review verdict" in str(err.value)


@pytest.mark.parametrize("status", [
    svc.REPORT_SUBMITTED, svc.REPORT_CHANGES_REQUESTED, svc.COMPLETED,
])
def test_no_lifecycle_status_is_settable_through_review(db_session, approved, status):
    with pytest.raises(svc.InvalidProposalStatus):
        svc.record_decision(db_session, approved, status=status,
                            decision_comment="x", internal_note=None, reviewer_id=1)


# ======================================================================
# The gate: one grant at a time
# ======================================================================

@pytest.mark.parametrize("status", sorted(svc.BLOCKING_STATUSES))
def test_funded_work_without_an_accepted_report_blocks_a_new_proposal(
    db_session, status
):
    d = _open_dossier(db_session, status=status)
    with pytest.raises(svc.OutstandingReport) as err:
        svc.create_proposal(db_session, content=_content(), submitted_ip="1.2.3.4",
                            sms_consent=False, sms_consent_text=None)
    # The message has to name the dossier, or the applicant cannot act on it.
    assert "#%d" % d.id in str(err.value)
    assert err.value.blocking.id == d.id


@pytest.mark.parametrize("status", [
    "submitted", "under_review", "changes_requested", "approved", "rejected",
    "completed",
])
def test_everything_else_leaves_them_free_to_apply(db_session, status):
    """Approved-but-not-yet-funded must NOT block: no money has moved. And a
    completed dossier releases them, which is the whole point of reporting."""
    _open_dossier(db_session, status=status)
    dossier, version = svc.create_proposal(
        db_session, content=_content(), submitted_ip="1.2.3.4",
        sms_consent=False, sms_consent_text=None)
    assert dossier.id is not None
    assert version.version_no == 1


def test_the_gate_is_case_insensitive_on_the_email(db_session):
    """Email is the identity key; a differently-cased address must not buy a
    second grant."""
    _open_dossier(db_session, status=svc.FUNDED, email="Naji@Example.COM")
    with pytest.raises(svc.OutstandingReport):
        svc.create_proposal(db_session, content=_content(email="naji@example.com"),
                            submitted_ip="1.2.3.4", sms_consent=False,
                            sms_consent_text=None)


def test_another_applicant_is_unaffected(db_session):
    _open_dossier(db_session, status=svc.FUNDED, email="naji@example.com")
    dossier, _ = svc.create_proposal(
        db_session, content=_content(email="other@example.com"),
        submitted_ip="1.2.3.4", sms_consent=False, sms_consent_text=None)
    assert dossier.email == "other@example.com"


def test_a_revision_of_an_existing_dossier_is_never_blocked(db_session):
    """The gate is about opening NEW work. A team told to fix their application
    must still be able to resubmit it."""
    d = _open_dossier(db_session, status="changes_requested")
    _open_dossier(db_session, status=svc.FUNDED, email="naji@example.com")
    version = svc.add_revision(db_session, d, content=_content(),
                               submitted_ip="1.2.3.4", sms_consent=False,
                               sms_consent_text=None)
    assert version.version_no == 2


def test_blocking_dossier_returns_none_for_an_unknown_address(db_session):
    assert svc.blocking_dossier(db_session, "nobody@example.com") is None
    assert svc.blocking_dossier(db_session, "") is None
    assert svc.blocking_dossier(db_session, None) is None


# ======================================================================
# Submitting a report
# ======================================================================

def test_submitting_a_report_moves_the_dossier_for_review(db_session, funded):
    report = svc.submit_report(db_session, funded, narrative="We served 48 families.",
                               submitted_ip="9.9.9.9")
    assert report.report_no == 1
    assert report.decision is None
    assert funded.status == svc.REPORT_SUBMITTED
    assert funded.current_report_id == report.id


def test_a_fresh_report_clears_the_review_stamp(db_session, funded):
    """Otherwise the admin list sorts it as though a decision had just been
    taken on it."""
    svc.submit_report(db_session, funded, narrative="done")
    assert funded.reviewed_at is None
    assert funded.reviewed_by is None


@pytest.mark.parametrize("status", [
    "submitted", "under_review", "changes_requested", "approved", "rejected",
])
def test_a_report_cannot_be_submitted_before_funding(db_session, status):
    d = _open_dossier(db_session, status=status)
    with pytest.raises(svc.ProposalNotFunded) as err:
        svc.submit_report(db_session, d, narrative="done")
    assert "funded" in str(err.value)


def test_a_second_report_cannot_be_submitted_while_one_is_under_review(
    db_session, funded
):
    svc.submit_report(db_session, funded, narrative="first")
    with pytest.raises(svc.ProposalNotFunded) as err:
        svc.submit_report(db_session, funded, narrative="second")
    assert "already awaiting review" in str(err.value)


def test_a_completed_dossier_takes_no_further_report(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    svc.record_report_decision(db_session, funded, decision="approved", reviewer_id=1)
    with pytest.raises(svc.ProposalNotFunded) as err:
        svc.submit_report(db_session, funded, narrative="again")
    assert "already completed" in str(err.value)


@pytest.mark.parametrize("narrative", ["", "   ", "\n\t ", None])
def test_an_empty_narrative_is_refused(db_session, funded, narrative):
    with pytest.raises(svc.ProposalError):
        svc.submit_report(db_session, funded, narrative=narrative)


def test_report_numbering_skips_a_gap_rather_than_colliding(db_session, funded):
    """MAX+1, not COUNT+1: a removed report would otherwise make COUNT+1 collide
    with one that already exists and break the dossier permanently."""
    first = svc.submit_report(db_session, funded, narrative="one")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="More detail please", reviewer_id=1)
    second = svc.submit_report(db_session, funded, narrative="two")
    assert second.report_no == 2

    db_session.delete(first)
    db_session.commit()
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="Still more", reviewer_id=1)
    third = svc.submit_report(db_session, funded, narrative="three")
    assert third.report_no == 3, "COUNT+1 would have collided with report 2"


# ======================================================================
# Deciding on a report
# ======================================================================

def test_accepting_a_report_completes_the_dossier(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    report = svc.record_report_decision(
        db_session, funded, decision="approved", reviewer_id=5)
    assert report.decision == "approved"
    assert report.decided_by == 5
    assert report.decided_at is not None
    assert funded.status == svc.COMPLETED


def test_completing_releases_the_applicant(db_session, funded):
    """The gate's exit. Without this the team is blocked forever."""
    svc.submit_report(db_session, funded, narrative="done")
    svc.record_report_decision(db_session, funded, decision="approved", reviewer_id=1)
    assert svc.blocking_dossier(db_session, funded.email) is None
    dossier, _ = svc.create_proposal(
        db_session, content=_content(), submitted_ip="1.2.3.4",
        sms_consent=False, sms_consent_text=None)
    assert dossier.id != funded.id


def test_sending_a_report_back_lets_the_team_resubmit(db_session, funded):
    """The other exit: an incomplete report must have a way forward, or the
    dossier traps them."""
    svc.submit_report(db_session, funded, narrative="too thin")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="Attach the receipts.", reviewer_id=1)
    assert funded.status == svc.REPORT_CHANGES_REQUESTED
    again = svc.submit_report(db_session, funded, narrative="with receipts")
    assert again.report_no == 2
    assert funded.status == svc.REPORT_SUBMITTED


def test_sending_a_report_back_requires_a_reason(db_session, funded):
    """It goes out in the email and is the only thing telling them what to
    fix."""
    svc.submit_report(db_session, funded, narrative="thin")
    for blank in (None, "", "   "):
        with pytest.raises(svc.ReportCommentRequired):
            svc.record_report_decision(db_session, funded,
                                       decision="changes_requested",
                                       decision_comment=blank, reviewer_id=1)


def test_accepting_needs_no_comment(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    report = svc.record_report_decision(db_session, funded, decision="approved",
                                        reviewer_id=1)
    assert report.decision == "approved"


def test_a_verdict_with_no_report_is_refused(db_session, funded):
    with pytest.raises(svc.NoReportToDecide):
        svc.record_report_decision(db_session, funded, decision="approved",
                                   reviewer_id=1)


def test_a_verdict_on_an_already_decided_report_is_refused(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    svc.record_report_decision(db_session, funded, decision="approved", reviewer_id=1)
    with pytest.raises(svc.NoReportToDecide) as err:
        svc.record_report_decision(db_session, funded, decision="approved",
                                   reviewer_id=1)
    assert "no\nreport awaiting review" in str(err.value).replace(" ", "\n", 1) \
        or "awaiting review" in str(err.value)


@pytest.mark.parametrize("decision", ["rejected", "funded", "", "APPROVED", None])
def test_an_invalid_report_verdict_is_refused(db_session, funded, decision):
    """Narrower than the application's verdicts: a report is accepted or sent
    back, never rejected outright -- the project happened and the dossier
    cannot close without an accepted account of it."""
    svc.submit_report(db_session, funded, narrative="done")
    with pytest.raises(svc.InvalidProposalStatus):
        svc.record_report_decision(db_session, funded, decision=decision,
                                   reviewer_id=1)


def test_history_is_kept_across_a_resubmission(db_session, funded):
    svc.submit_report(db_session, funded, narrative="first try")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="Receipts missing", reviewer_id=1)
    svc.submit_report(db_session, funded, narrative="second try")
    svc.record_report_decision(db_session, funded, decision="approved", reviewer_id=1)

    reports = svc.reports_for(db_session, funded)
    assert [r.report_no for r in reports] == [1, 2]
    assert reports[0].decision == "changes_requested"
    assert reports[0].decision_comment == "Receipts missing"
    assert reports[1].decision == "approved"
    assert reports[0].narrative == "first try", "an earlier report was rewritten"


def test_current_report_follows_the_pointer(db_session, funded):
    svc.submit_report(db_session, funded, narrative="one")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="again", reviewer_id=1)
    second = svc.submit_report(db_session, funded, narrative="two")
    assert svc.current_report(db_session, funded).id == second.id


def test_current_report_falls_back_when_the_pointer_is_unset(db_session, funded):
    """A row the pointer never got set on -- the deployment window of migration
    36, same fallback current_version() has."""
    report = svc.submit_report(db_session, funded, narrative="one")
    funded.current_report_id = None
    db_session.commit()
    assert svc.current_report(db_session, funded).id == report.id


# ======================================================================
# The admin badge
# ======================================================================

def test_an_arriving_report_marks_the_dossier_unread(db_session, funded):
    """Without this the team's report lands silently, the dossier sits
    unreviewed, and they stay blocked for a reason nobody can see."""
    svc.mark_seen(db_session, funded)
    assert svc.is_unread(funded) is False

    svc.submit_report(db_session, funded, narrative="done")
    assert svc.is_unread(funded) is True
    assert svc.unread_count(db_session) == 1


def test_reading_clears_both_the_version_and_the_report(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    assert svc.mark_seen(db_session, funded) is True
    assert svc.is_unread(funded) is False
    assert funded.admin_seen_report_id == funded.current_report_id
    assert funded.admin_seen_version_id == funded.current_version_id


def test_a_dossier_with_both_outstanding_is_counted_once(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    # version unseen AND report unseen
    assert funded.admin_seen_version_id is None
    assert funded.admin_seen_report_id is None
    assert svc.unread_count(db_session) == 1


def test_a_resubmitted_report_makes_it_unread_again(db_session, funded):
    svc.submit_report(db_session, funded, narrative="one")
    svc.mark_seen(db_session, funded)
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="again", reviewer_id=1)
    svc.submit_report(db_session, funded, narrative="two")
    assert svc.is_unread(funded) is True


# ======================================================================
# Serialization boundaries
# ======================================================================

def test_the_portal_never_sees_staff_fields(db_session, funded):
    report = svc.submit_report(db_session, funded, narrative="done",
                               submitted_ip="9.9.9.9")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="Receipts", internal_note="SECRET",
                               reviewer_id=3)
    db_session.refresh(report)

    out = svc.serialize_portal_report(report)
    body = repr(out)
    assert "SECRET" not in body, "internal note leaked to the applicant"
    assert "9.9.9.9" not in body, "submitted IP leaked to the applicant"
    assert "decided_by" not in out
    # But the reason must reach them -- it is the only thing to act on.
    assert out["decision_comment"] == "Receipts"


def test_the_staff_shape_keeps_the_internal_note(db_session, funded):
    report = svc.submit_report(db_session, funded, narrative="done")
    svc.record_report_decision(db_session, funded, decision="changes_requested",
                               decision_comment="Receipts", internal_note="SECRET",
                               reviewer_id=3)
    db_session.refresh(report)
    out = svc.serialize_report(report, staff=True)
    assert out["internal_note"] == "SECRET"
    assert out["decided_by"] == 3


def test_the_portal_payload_says_whether_a_report_may_be_sent(db_session, funded):
    out = svc.serialize_for_portal(funded, svc.current_version(db_session, funded))
    assert out["may_submit_report"] is True
    assert out["awaiting_report_review"] is False
    assert out["completed"] is False

    svc.submit_report(db_session, funded, narrative="done")
    out = svc.serialize_for_portal(funded, svc.current_version(db_session, funded))
    assert out["may_submit_report"] is False
    assert out["awaiting_report_review"] is True

    svc.record_report_decision(db_session, funded, decision="approved", reviewer_id=1)
    out = svc.serialize_for_portal(funded, svc.current_version(db_session, funded))
    assert out["completed"] is True
    assert out["may_submit_report"] is False


def test_the_admin_payload_flags_a_report_to_review(db_session, funded):
    svc.submit_report(db_session, funded, narrative="done")
    out = svc.serialize_for_admin(
        funded, svc.current_version(db_session, funded), db=db_session)
    assert out["has_report"] is True
    assert out["awaiting_report_review"] is True
    assert out["report_unread"] is True
