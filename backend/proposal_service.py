"""Project proposal domain logic: dossiers, their version chain, decisions.

A dossier (`ProjectProposal`) holds identity and review state. Every submission
writes one `ProposalVersion` carrying the content exactly as it was sent. A
decision is recorded on the version it judges, which makes the history
self-explanatory: the comment on version 1 is precisely what caused version 2.

Immutability, precisely: only the CURRENT version is ever written to. An admin
may amend the current version's decision — correcting a typo, or reopening a
rejection as a change request — but no code path addresses a superseded version
for writing, so once a newer version exists the older one is frozen.

No HTTP and no email here. The router translates these exceptions into status
codes and queues the notifications.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    ProjectProposal,
    ProposalAgreement,
    ProposalReport,
    ProposalReportAttachment,
    ProposalVersion,
)

# Every field the applicant fills in, in form order. One source of truth for the
# router's payload dump, the version insert, and the serializers.
PROPOSAL_CONTENT_FIELDS: tuple[str, ...] = (
    # Section 1 — personal
    "full_name", "national_id", "date_of_birth_year", "place_of_residence",
    "mobile_number", "email", "educational_level",
    # Section 2 — project
    "project_name", "project_description", "problem_solved",
    "target_beneficiaries", "community_impact", "expected_impact",
    # Section 3 — plan
    "implementation_steps", "implementation_location", "required_materials",
    "expected_duration", "continuity_plan", "feasibility", "expected_challenges",
    # Section 4 — budget
    "number_of_beneficiaries", "cost_per_unit_usd", "unit_type",
    "additional_expenses_usd", "additional_expenses_description", "total_amount_usd",
)

# ── The lifecycle ────────────────────────────────────────────────────
#
#   submitted -> under_review -> approved -> funded -> report_submitted
#                                                           -> completed
#
# with changes_requested branching off review, rejected ending it, and
# report_changes_requested sending a report back to the team.
#
# `approved` and `funded` are deliberately two steps. Approval is the verdict on
# the application; funded means the money actually left. The agreement is drawn
# up between them, and the rule that blocks a team from opening a second dossier
# must only bite once funds have really been released.
FUNDED = "funded"
REPORT_SUBMITTED = "report_submitted"
REPORT_CHANGES_REQUESTED = "report_changes_requested"
COMPLETED = "completed"

# What record_decision() may set: verdicts on the application itself. The
# lifecycle statuses below are NOT here on purpose — each has its own
# transition guard, and letting PATCH /status set `funded` directly would
# bypass "only from approved" and stamp reviewed_at for a disbursement.
REVIEW_STATUSES = frozenset(
    {"submitted", "under_review", "changes_requested", "approved", "rejected"}
)

# Every value the status column may hold. Used to validate the admin list
# filter, which must be able to ask for `funded` or `completed`.
VALID_STATUSES = REVIEW_STATUSES | frozenset(
    {FUNDED, REPORT_SUBMITTED, REPORT_CHANGES_REQUESTED, COMPLETED}
)

# Statuses that constitute a decision on the current version.
DECISION_STATUSES = frozenset({"approved", "rejected", "changes_requested"})
# Decisions the submitter must be given a reason for.
COMMENT_REQUIRED_STATUSES = frozenset({"rejected", "changes_requested"})
# The one status from which a submitter may send a new version.
EDITABLE_STATUSES = frozenset({"changes_requested"})

# Money has been released and no report has been accepted yet. A dossier in one
# of these blocks its owner from opening another one.
BLOCKING_STATUSES = frozenset({FUNDED, REPORT_SUBMITTED, REPORT_CHANGES_REQUESTED})

# Where a team may submit, or resubmit, a completion report from.
REPORT_SUBMITTABLE_STATUSES = frozenset({FUNDED, REPORT_CHANGES_REQUESTED})

# Verdicts on a report. Narrower than the application's: a report is either
# accepted or sent back, never "rejected" outright — the project happened, and
# the dossier cannot be closed without an accepted account of it.
REPORT_DECISIONS = frozenset({"approved", "changes_requested"})


class ProposalError(Exception):
    """Base class so the router can catch the whole family."""


class InvalidProposalStatus(ProposalError):
    """A status outside VALID_STATUSES was requested."""


class DecisionCommentRequired(ProposalError):
    """A rejection or change request arrived without a message for the applicant."""


class ProposalNotEditable(ProposalError):
    """A revision was attempted on a dossier that is not awaiting changes."""


def _consent_fields(sms_consent: bool, sms_consent_text: str | None) -> dict[str, Any]:
    """Normalise the optional SMS opt-in into storable columns.

    Consent text without consent is never recorded: a false consent trail is
    worse than none at all for a 10DLC audit.
    """
    if not sms_consent:
        return {"sms_consent": False, "sms_consent_text": None, "sms_consent_at": None}
    return {
        "sms_consent": True,
        "sms_consent_text": sms_consent_text,
        "sms_consent_at": datetime.utcnow(),
    }


def _content_only(content: dict[str, Any]) -> dict[str, Any]:
    """Keep exactly the content fields, ignoring anything else the caller sent."""
    return {key: content.get(key) for key in PROPOSAL_CONTENT_FIELDS}


def create_proposal(
    db: Session,
    *,
    content: dict[str, Any],
    submitted_ip: str,
    sms_consent: bool,
    sms_consent_text: str | None,
) -> tuple[ProjectProposal, ProposalVersion]:
    """Open a new dossier with its version 1.

    Always a new dossier: one email may own several. A revision of an existing
    dossier goes through `add_revision`.

    Refused while the applicant still owes an accepted completion report on
    funded work -- see assert_may_open_new_dossier(). The check lives here, not
    in the router, so every caller inherits it: the public form today, and
    anything added later.
    """
    fields = _content_only(content)
    assert_may_open_new_dossier(db, fields.get("email"))
    dossier = ProjectProposal(
        email=fields["email"],
        full_name=fields["full_name"],
        status="submitted",
    )
    db.add(dossier)
    db.flush()  # need dossier.id before the version can reference it

    version = ProposalVersion(
        proposal_id=dossier.id,
        version_no=1,
        submitted_ip=submitted_ip or None,
        **fields,
        **_consent_fields(sms_consent, sms_consent_text),
    )
    db.add(version)
    db.flush()  # need version.id for the pointer

    dossier.current_version_id = version.id
    db.commit()
    db.refresh(dossier)
    db.refresh(version)
    return dossier, version


def add_revision(
    db: Session,
    proposal: ProjectProposal,
    *,
    content: dict[str, Any],
    submitted_ip: str,
    sms_consent: bool,
    sms_consent_text: str | None,
    submitted_by_staff: str | None = None,
) -> ProposalVersion:
    """Append the next version and send the dossier back for review.

    `submitted_by_staff` is the admin who filed it from the portal on the
    team's behalf, if one did.

    The dossier's email is authoritative and overrides whatever the payload
    carried: it is the identity key and the portal's access key, so a revision
    can never move a dossier to another address.
    """
    if proposal.status not in EDITABLE_STATUSES:
        raise ProposalNotEditable(
            f"A proposal in status '{proposal.status}' cannot be revised."
        )

    fields = _content_only(content)
    fields["email"] = proposal.email

    # MAX, not COUNT: a gap in the chain (a version removed by some future
    # cleanup) would make COUNT+1 collide with a version that already exists and
    # brick the dossier for good. MAX+1 just skips the gap.
    highest = (
        db.query(func.max(ProposalVersion.version_no))
        .filter(ProposalVersion.proposal_id == proposal.id)
        .scalar()
    )
    next_no = (highest or 0) + 1
    version = ProposalVersion(
        proposal_id=proposal.id,
        version_no=next_no,
        submitted_ip=submitted_ip or None,
        submitted_by_staff=submitted_by_staff or None,
        **fields,
        **_consent_fields(sms_consent, sms_consent_text),
    )
    db.add(version)
    db.flush()

    proposal.current_version_id = version.id
    proposal.full_name = fields["full_name"]
    proposal.status = "submitted"
    # A fresh submission is not yet reviewed; clear the previous review stamp so
    # the admin list does not sort it as though it had just been decided.
    proposal.reviewed_at = None
    proposal.reviewed_by = None
    db.commit()
    db.refresh(proposal)
    db.refresh(version)
    return version


def record_decision(
    db: Session,
    proposal: ProjectProposal,
    *,
    status: str,
    decision_comment: str | None,
    internal_note: str | None,
    reviewer_id: int,
) -> ProposalVersion:
    """Write the reviewer's verdict onto the dossier's current version.

    `decision_comment=None` means "leave the existing comment alone", which is
    what the admin drawer sends when it is only saving an internal note. An
    empty or blank string on a rejection or change request is refused: the
    submitter would receive an email with no reason in it.

    Reopening never erases history: moving a dossier back to `submitted` or
    `under_review` changes the dossier's status only and leaves the version's
    `decision`, `decided_at` and `decided_by` exactly as they were. Those fields
    record the last verdict actually taken on this version, which remains a true
    statement about the past however the file moves on afterwards.

    `decided_at` and `decided_by` move only when the verdict itself changes. The
    drawer's "save without notifying" re-sends the status already on file, and a
    note saved that way must not re-date the decision nor credit it to whoever
    happened to open the drawer last.
    """
    if status not in REVIEW_STATUSES:
        # A lifecycle status reaching here means a caller tried to shortcut a
        # transition that has its own guard — mark_funded(), submit_report(),
        # record_report_decision(). Naming them beats "invalid status".
        if status in VALID_STATUSES:
            raise InvalidProposalStatus(
                f"'{status}' is not a review verdict; it is reached through the "
                f"funding and reporting steps, not by setting the status."
            )
        raise InvalidProposalStatus(f"Invalid status: {status}")

    version = current_version(db, proposal)
    if version is None:
        raise ProposalError(f"Proposal #{proposal.id} has no version to decide on.")

    if status in COMMENT_REQUIRED_STATUSES:
        effective = decision_comment if decision_comment is not None else version.decision_comment
        if not (effective or "").strip():
            raise DecisionCommentRequired(
                f"Status '{status}' requires a message for the applicant."
            )

    if decision_comment is not None:
        version.decision_comment = decision_comment.strip() or None
    if internal_note is not None:
        version.internal_note = internal_note.strip() or None

    if status in DECISION_STATUSES:
        # Re-stamp only on a real change of verdict. The admin drawer's
        # "save without notifying" re-sends the CURRENT status, and that must
        # not re-date a decision or re-attribute it to whoever last opened the
        # drawer -- the history would then show a date on which nothing was
        # sent, beside a name that did not decide.
        if version.decision != status:
            version.decision = status
            version.decided_at = datetime.utcnow()
            version.decided_by = reviewer_id
    # A move to 'submitted' or 'under_review' deliberately leaves the version's
    # decision fields alone. They record the last verdict actually taken on this
    # version, which stays true after a reopening -- and the point of the
    # version chain is that such a fact is never lost. The dossier's `status` is
    # what says where the file stands right now.

    proposal.status = status
    proposal.reviewed_at = datetime.utcnow()
    proposal.reviewed_by = reviewer_id
    db.commit()
    db.refresh(proposal)
    db.refresh(version)
    return version


def current_version(db: Session, proposal: ProjectProposal) -> ProposalVersion | None:
    """The dossier's latest version, by its pointer, falling back to the chain.

    The fallback matters during the deployment window described in the plan: a
    row that migration 32 has not yet pointed still resolves correctly.
    """
    if proposal.current_version_id is not None:
        found = (
            db.query(ProposalVersion)
            .filter(ProposalVersion.id == proposal.current_version_id)
            .first()
        )
        if found is not None:
            return found
    return (
        db.query(ProposalVersion)
        .filter(ProposalVersion.proposal_id == proposal.id)
        .order_by(ProposalVersion.version_no.desc())
        .first()
    )


def versions_by_proposal(
    db: Session, proposal_ids: Iterable[int]
) -> dict[int, list[ProposalVersion]]:
    """All versions for the given dossiers, grouped, in one query.

    The admin list needs each row's current content plus its version count; this
    keeps that at two queries total instead of one per row.
    """
    ids = list(proposal_ids)
    grouped: dict[int, list[ProposalVersion]] = {pid: [] for pid in ids}
    if not ids:
        return grouped
    rows = (
        db.query(ProposalVersion)
        .filter(ProposalVersion.proposal_id.in_(ids))
        .order_by(ProposalVersion.proposal_id, ProposalVersion.version_no)
        .all()
    )
    for row in rows:
        grouped.setdefault(row.proposal_id, []).append(row)
    return grouped


def _content_dict(version: ProposalVersion | None) -> dict[str, Any]:
    """The content fields of a version, with the numeric ones as plain floats.

    `sms_consent` is added on top of PROPOSAL_CONTENT_FIELDS rather than into
    it: that tuple also filters inbound payloads, and consent arrives by its own
    route (_consent_fields), so listing it there would write it twice from two
    sources. It belongs in the OUTPUT because the portal has to be able to show
    a revising applicant the opt-in they already gave -- otherwise the form
    renders an empty box and the revision silently withdraws consent the
    applicant never withdrew.

    `sms_consent_text` stays out: the exact wording agreed to is a 10DLC audit
    artifact for staff, and the portal has no use for it.
    """
    if version is None:
        out: dict[str, Any] = {key: None for key in PROPOSAL_CONTENT_FIELDS}
        out["sms_consent"] = False
        return out
    out = {key: getattr(version, key) for key in PROPOSAL_CONTENT_FIELDS}
    out["cost_per_unit_usd"] = float(version.cost_per_unit_usd or 0)
    out["additional_expenses_usd"] = float(version.additional_expenses_usd or 0)
    out["total_amount_usd"] = float(version.total_amount_usd or 0)
    out["sms_consent"] = bool(version.sms_consent)
    return out


def serialize_version_summary(version: ProposalVersion) -> dict[str, Any]:
    """One entry in the admin's version history. Staff-only fields included."""
    return {
        "id": version.id,
        "version_no": version.version_no,
        "submitted_at": version.submitted_at,
        "submitted_ip": version.submitted_ip,
        "submitted_by_staff": version.submitted_by_staff,
        "decision": version.decision,
        "decision_comment": version.decision_comment,
        "internal_note": version.internal_note,
        "decided_at": version.decided_at,
        "decided_by": version.decided_by,
    }


def serialize_for_admin(
    proposal: ProjectProposal,
    version: ProposalVersion | None,
    *,
    db: Session | None = None,
    versions: list[ProposalVersion] | None = None,
) -> dict[str, Any]:
    """Dossier + current content flattened + the full version history.

    The content is flattened rather than nested so the existing admin page keeps
    rendering unchanged; `versions` is the new part. Pass `versions` when the
    caller has already loaded them in bulk (the list endpoint does) to avoid a
    query per row.
    """
    if versions is None:
        if db is None:
            raise ValueError("serialize_for_admin needs either `db` or `versions`.")
        versions = (
            db.query(ProposalVersion)
            .filter(ProposalVersion.proposal_id == proposal.id)
            .order_by(ProposalVersion.version_no)
            .all()
        )
    out: dict[str, Any] = {
        "id": proposal.id,
        "email": proposal.email,
        "status": proposal.status,
        "submitted_at": proposal.submitted_at,
        "updated_at": proposal.updated_at,
        "reviewed_at": proposal.reviewed_at,
        "reviewed_by": proposal.reviewed_by,
        "version_count": len(versions),
        "current_version_no": version.version_no if version else None,
        "versions": [serialize_version_summary(v) for v in versions],
        # Drives the admin badge and the row marker. `is_revision` separates
        # "someone changed their application" from "a new application arrived":
        # both arrive as status='submitted', but only the first means the
        # reviewer is looking at something they have already read once.
        "is_unread": is_unread(proposal),
        "is_revision": len(versions) > 1,
        # Reporting state, so the list can show "report to review" without a
        # second request per row.
        "has_report": proposal.current_report_id is not None,
        "awaiting_report_review": proposal.status == REPORT_SUBMITTED,
        "report_unread": (
            proposal.current_report_id is not None
            and proposal.admin_seen_report_id != proposal.current_report_id
        ),
        # Kept for the current admin UI, which reads these at the top level.
        "submitted_ip": version.submitted_ip if version else None,
        "decision_comment": version.decision_comment if version else None,
        "internal_note": version.internal_note if version else None,
        "sms_consent": bool(version.sms_consent) if version else False,
        "sms_consent_at": version.sms_consent_at if version else None,
        "sms_consent_text": version.sms_consent_text if version else None,
    }
    out.update(_content_dict(version))
    # The dossier's email wins over the snapshot's — they only differ for rows
    # written before the identity key was enforced.
    out["email"] = proposal.email
    return out


def serialize_version_detail(
    proposal: ProjectProposal, version: ProposalVersion
) -> dict[str, Any]:
    """One historical version in full: its frozen content and its decision."""
    out = serialize_version_summary(version)
    out["proposal_id"] = proposal.id
    out["status"] = proposal.status
    out.update(_content_dict(version))
    return out


def serialize_for_portal(
    proposal: ProjectProposal, version: ProposalVersion | None
) -> dict[str, Any]:
    """What the submitter is allowed to see about their own dossier.

    A separate function from the admin serializer on purpose: `internal_note`,
    `submitted_ip`, `reviewed_by` and `decided_by` must never reach an applicant,
    and a shared serializer with a flag is one forgotten argument away from a
    leak.
    """
    return {
        "id": proposal.id,
        "project_name": version.project_name if version else None,
        "status": proposal.status,
        "editable": proposal.status in EDITABLE_STATUSES,
        "submitted_at": proposal.submitted_at,
        "updated_at": proposal.updated_at,
        "version_no": version.version_no if version else None,
        # Only while the dossier still stands on a decision. The version keeps
        # its comment for the admin history either way -- but an applicant must
        # never read a past verdict as though it were the current one, which is
        # what happens the moment a reviewer moves a rejected dossier back to
        # 'submitted' or 'under_review' for a second look.
        "decision_comment": (
            version.decision_comment
            if version is not None and proposal.status in DECISION_STATUSES
            else None
        ),
        "content": _content_dict(version),
        # ── Reporting ──
        # `may_submit_report` is computed here rather than left to the portal
        # to infer from `status`: the rule is one place, and the UI showing a
        # form the backend would refuse is worse than showing none.
        "may_submit_report": proposal.status in REPORT_SUBMITTABLE_STATUSES,
        "awaiting_report_review": proposal.status == REPORT_SUBMITTED,
        "completed": proposal.status == COMPLETED,
        # Set by the caller, which has the report and its attachments loaded.
        "report": None,
    }


def serialize_portal_report(report, *, attachments=None) -> dict[str, Any]:
    """A report as its own team may see it.

    Deliberately not serialize_report(staff=False): that one is shaped for the
    admin console. Keeping them apart means `internal_note` has no path to an
    applicant even if someone later adds a field to the staff shape.
    """
    if report is None:
        return None
    return {
        "report_no": report.report_no,
        "narrative": report.narrative,
        "submitted_at": report.submitted_at,
        "decision": report.decision,
        # Why it was sent back. The only thing telling the team what to fix.
        "decision_comment": report.decision_comment,
        "decided_at": report.decided_at,
        "attachments": [
            {
                "id": a.id,
                "filename": a.filename,
                "kind": a.kind,
                "size_bytes": a.size_bytes,
            }
            for a in (attachments or [])
        ],
    }


def delete_proposal(db: Session, proposal: ProjectProposal) -> None:
    """Remove a dossier and its whole version chain.

    The versions are deleted explicitly rather than left to ON DELETE CASCADE:
    the SQLite test runner does not enforce foreign keys, so relying on the
    database would leave orphans in the suite and pass silently. The pointer is
    cleared first because project_proposals.current_version_id references the
    rows about to go.
    """
    proposal.current_version_id = None
    db.flush()
    db.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == proposal.id
    ).delete(synchronize_session=False)
    db.delete(proposal)
    db.commit()


# -------------------------------------------------------------------
# Unread tracking
#
# "Has anyone looked at the current version of this dossier?" -- one fact per
# dossier, which is why it is a column and not an event stream. It cannot be
# derived from `status`: add_revision() sets status='submitted' for a brand-new
# dossier as well as for a revision, so the two are indistinguishable that way,
# and marking a dossier read would otherwise mean changing its review state.
# -------------------------------------------------------------------

def is_unread(proposal: ProjectProposal) -> bool:
    """True when something on this dossier has not been opened by an admin.

    Either side can be the unread thing: a new or revised application, or a
    completion report that has arrived. A report is not a version, so it needs
    its own pointer -- without this, a team submitting a report would light
    nothing up and the dossier would sit unreviewed, blocking them from
    applying again for a reason nobody could see.

    A dossier with neither a version nor a report is not unread: there is
    nothing to read, and putting it in the badge would send the reviewer to an
    empty drawer.
    """
    version_unread = (
        proposal.current_version_id is not None
        and proposal.admin_seen_version_id != proposal.current_version_id
    )
    report_unread = (
        proposal.current_report_id is not None
        and proposal.admin_seen_report_id != proposal.current_report_id
    )
    return version_unread or report_unread


def unread_count(db: Session) -> int:
    """How many dossiers are waiting to be looked at -- the admin badge.

    Mirrors is_unread(): an unseen application OR an unseen completion report.
    Written as one OR over both pairs rather than two queries, so a dossier
    with both outstanding is still counted once.
    """
    version_unread = ProjectProposal.current_version_id.isnot(None) & (
        (ProjectProposal.admin_seen_version_id.is_(None))
        | (ProjectProposal.admin_seen_version_id
           != ProjectProposal.current_version_id)
    )
    report_unread = ProjectProposal.current_report_id.isnot(None) & (
        (ProjectProposal.admin_seen_report_id.is_(None))
        | (ProjectProposal.admin_seen_report_id
           != ProjectProposal.current_report_id)
    )
    return (
        db.query(func.count(ProjectProposal.id))
        .filter(version_unread | report_unread)
        .scalar()
    ) or 0


def mark_seen(db: Session, proposal: ProjectProposal) -> bool:
    """Record that an admin has opened the current version.

    Returns whether anything changed, so the caller can skip logging on every
    re-open of an already-read dossier.

    Deliberately does NOT touch `updated_at`: reading a dossier is not a change
    to it, and bumping the timestamp would reorder the admin list -- which sorts
    on updated_at -- under the reviewer as they clicked through it.

    That takes an explicit assignment, not just a bulk update: Query.update()
    DOES apply a Python-side `onupdate`, so leaving the column out of the SET
    clause would still rewrite it. Passing the current value overrides it.
    """
    if not is_unread(proposal):
        return False
    db.query(ProjectProposal).filter(ProjectProposal.id == proposal.id).update(
        {
            ProjectProposal.admin_seen_version_id: proposal.current_version_id,
            ProjectProposal.admin_seen_report_id: proposal.current_report_id,
            ProjectProposal.updated_at: proposal.updated_at,
        },
        synchronize_session=False,
    )
    db.commit()
    db.refresh(proposal)
    return True


# -------------------------------------------------------------------
# Funding agreement
# -------------------------------------------------------------------

# The fields a reviewer may set. Anything outside this tuple in a payload is
# ignored rather than written, so a stray key cannot reach the ORM.
AGREEMENT_FIELDS: tuple[str, ...] = (
    "project_title", "location", "field_representative",
    "approved_funding_usd", "target_count", "target_label",
    "distribution_per_beneficiary", "total_planned_distribution",
    "extra_fund_uses",
)

# Fields the document cannot be issued without. The two distribution lines are
# NOT here: a project handing out one indivisible thing per beneficiary has
# nothing sensible to put in them, and the renderer omits those lines when they
# are blank.
AGREEMENT_REQUIRED: tuple[str, ...] = (
    "project_title", "location", "field_representative", "target_label",
)


class AgreementIncomplete(ProposalError):
    """A required agreement field is missing or blank."""


class ProposalNotApproved(ProposalError):
    """An agreement was requested for a dossier that is not approved."""


def _first_line(text) -> str:
    """The first non-blank line of a free-text field, for a one-line slot."""
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()
    return ""


def _pluralise(label: str, count: int) -> str:
    """"family" -> "families" for a count other than one.

    Naive on purpose: the reviewer sees and corrects this field before anything
    is issued, so a clever inflector would be more code for no extra safety.
    """
    label = (label or "").strip()
    if not label or count == 1 or label.endswith("s"):
        return label or "beneficiaries"
    if label.endswith("y") and label[-2:-1] not in "aeiou":
        return label[:-1] + "ies"
    return label + "s"


def agreement_draft(proposal: ProjectProposal, version) -> dict[str, Any]:
    """Pre-fill the agreement form from the approved version.

    Everything that maps cleanly is filled; the two distribution lines are left
    empty on purpose. They cannot be derived -- "10 kg rice + 10 kg potatoes" is
    not a function of any submitted field -- and guessing would put a wrong
    figure into a document that quotes it again in sections 3, 4 and 7.

    `location` takes only the first line of implementation_location, which
    applicants often write as a paragraph; the agreement header needs one line.
    """
    if version is None:
        return {name: "" for name in AGREEMENT_FIELDS}

    count = int(version.number_of_beneficiaries or 0)
    return {
        "project_title": (version.project_name or "").strip(),
        "location": _first_line(version.implementation_location),
        "field_representative": (
            version.full_name or proposal.full_name or "").strip(),
        "approved_funding_usd": float(version.total_amount_usd or 0),
        "target_count": count,
        "target_label": _pluralise(version.unit_type, count),
        # Left blank for the reviewer -- see the docstring.
        "distribution_per_beneficiary": "",
        "total_planned_distribution": "",
        "extra_fund_uses": _first_line(version.required_materials),
    }


def get_agreement(db: Session, proposal: ProjectProposal):
    return (
        db.query(ProposalAgreement)
        .filter(ProposalAgreement.proposal_id == proposal.id)
        .one_or_none()
    )


def _clean_agreement_fields(fields: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for name in AGREEMENT_FIELDS:
        if name not in fields:
            continue
        value = fields[name]
        if name == "approved_funding_usd":
            try:
                value = round(float(value or 0), 2)
            except (TypeError, ValueError):
                raise AgreementIncomplete("Approved funding must be a number.")
            if value < 0:
                raise AgreementIncomplete("Approved funding cannot be negative.")
        elif name == "target_count":
            try:
                value = int(value or 0)
            except (TypeError, ValueError):
                raise AgreementIncomplete("Target count must be a whole number.")
            if value < 1:
                raise AgreementIncomplete("Target count must be at least 1.")
        else:
            value = (str(value).strip() if value is not None else "")
        clean[name] = value
    return clean


def save_agreement(
    db: Session,
    proposal: ProjectProposal,
    *,
    fields: dict[str, Any],
    reviewer_id,
):
    """Create or update the dossier's agreement draft.

    Refuses on a dossier that is not approved: an agreement commits funds, and
    the one gate that must not be bypassable from the UI is issuing one for a
    proposal nobody approved.
    """
    if proposal.status != "approved":
        raise ProposalNotApproved(
            "A funding agreement needs an approved proposal; this one is "
            "'%s'." % proposal.status
        )

    clean = _clean_agreement_fields(fields)
    agreement = get_agreement(db, proposal)

    if agreement is None:
        # Start from the draft so a partial payload still yields a complete row,
        # then overlay what the reviewer actually sent.
        base = agreement_draft(proposal, current_version(db, proposal))
        base.update({k: v for k, v in clean.items() if v != ""})
        missing = [n for n in AGREEMENT_REQUIRED
                   if not str(base.get(n) or "").strip()]
        if missing:
            raise AgreementIncomplete(
                "Missing required field(s): " + ", ".join(missing))
        agreement = ProposalAgreement(
            proposal_id=proposal.id,
            version_id=proposal.current_version_id,
            project_title=base["project_title"],
            location=base["location"],
            field_representative=base["field_representative"],
            approved_funding_usd=float(base.get("approved_funding_usd") or 0),
            target_count=int(base.get("target_count") or 1),
            target_label=base["target_label"],
            distribution_per_beneficiary=base.get(
                "distribution_per_beneficiary") or "",
            total_planned_distribution=base.get(
                "total_planned_distribution") or "",
            extra_fund_uses=base.get("extra_fund_uses") or None,
            updated_by=reviewer_id,
        )
        db.add(agreement)
    else:
        for name, value in clean.items():
            if name in AGREEMENT_REQUIRED and not str(value or "").strip():
                raise AgreementIncomplete("'%s' cannot be blank." % name)
            if name == "extra_fund_uses":
                value = value or None
            setattr(agreement, name, value)
        agreement.updated_by = reviewer_id

    db.commit()
    db.refresh(agreement)
    return agreement


def mark_agreement_issued(db: Session, agreement) -> bool:
    """Stamp first issue. Returns whether this was the first time.

    Only the first download is stamped: `issued_at` answers "has this gone out
    to the representative", and overwriting it on every re-download would turn
    it into "when did someone last click the button" -- a different and much
    less useful question.
    """
    if agreement.issued_at is not None:
        return False
    agreement.issued_at = datetime.utcnow()
    db.commit()
    db.refresh(agreement)
    return True


def serialize_agreement(agreement):
    if agreement is None:
        return None
    return {
        "id": agreement.id,
        "proposal_id": agreement.proposal_id,
        "version_id": agreement.version_id,
        "project_title": agreement.project_title,
        "location": agreement.location,
        "field_representative": agreement.field_representative,
        "approved_funding_usd": float(agreement.approved_funding_usd or 0),
        "target_count": agreement.target_count,
        "target_label": agreement.target_label,
        "distribution_per_beneficiary":
            agreement.distribution_per_beneficiary or "",
        "total_planned_distribution":
            agreement.total_planned_distribution or "",
        "extra_fund_uses": agreement.extra_fund_uses or "",
        "created_at": agreement.created_at,
        "updated_at": agreement.updated_at,
        "issued_at": agreement.issued_at,
    }


# -------------------------------------------------------------------
# Funding, reporting, completion
# -------------------------------------------------------------------

class ProposalNotFunded(ProposalError):
    """A report was offered for a dossier that is not awaiting one."""


class NoReportToDecide(ProposalError):
    """A report verdict was recorded with no submitted report to judge."""


class ReportCommentRequired(ProposalError):
    """Sending a report back needs a reason the team can act on."""


class OutstandingReport(ProposalError):
    """The applicant already has funded work with no accepted report.

    Carries the blocking dossier so the caller can name it: "proposal #12 is
    still open" is actionable, "you cannot submit" is not.
    """

    def __init__(self, message: str, blocking):
        super().__init__(message)
        self.blocking = blocking


def mark_funded(db: Session, proposal: ProjectProposal, *, reviewer_id):
    """Record that the approved funding has actually been released.

    Only from `approved`: funded is a statement about money leaving, and the
    agreement is drawn up in between. Re-marking an already-funded dossier is a
    no-op rather than an error, so a double click cannot re-date anything.
    """
    if proposal.status == FUNDED:
        return proposal
    if proposal.status != "approved":
        raise InvalidProposalStatus(
            f"Only an approved proposal can be marked funded; this one is "
            f"'{proposal.status}'."
        )
    proposal.status = FUNDED
    proposal.reviewed_at = datetime.utcnow()
    proposal.reviewed_by = reviewer_id
    db.commit()
    db.refresh(proposal)
    return proposal


def blocking_dossier(db: Session, email: str):
    """The applicant's funded dossier that still owes an accepted report.

    `None` means they are free to apply again. Matched on the lowercased email,
    which is the identity key for the whole feature, so a differently-cased
    address cannot be used to get a second dossier.
    """
    if not (email or "").strip():
        return None
    return (
        db.query(ProjectProposal)
        .filter(func.lower(ProjectProposal.email) == (email or "").strip().lower())
        .filter(ProjectProposal.status.in_(tuple(BLOCKING_STATUSES)))
        .order_by(ProjectProposal.submitted_at)
        .first()
    )


def assert_may_open_new_dossier(db: Session, email: str) -> None:
    """Raise OutstandingReport when the applicant still owes a report.

    Enforced here rather than in the router so the portal, the public form and
    anything added later all inherit it — this is the rule that stops a team
    collecting a second grant before accounting for the first.
    """
    blocking = blocking_dossier(db, email)
    if blocking is None:
        return
    raise OutstandingReport(
        f"Proposal #{blocking.id} has been funded and its completion report "
        f"has not been accepted yet. Submit and get that report approved "
        f"before applying again.",
        blocking,
    )


def current_report(db: Session, proposal: ProjectProposal):
    """The report that counts, following the dossier's pointer.

    Falls back to the highest report_no for a row the pointer never got set on,
    exactly as current_version() does for versions.
    """
    if proposal.current_report_id is not None:
        found = (
            db.query(ProposalReport)
            .filter(ProposalReport.id == proposal.current_report_id)
            .one_or_none()
        )
        if found is not None:
            return found
    return (
        db.query(ProposalReport)
        .filter(ProposalReport.proposal_id == proposal.id)
        .order_by(ProposalReport.report_no.desc())
        .first()
    )


def reports_for(db: Session, proposal: ProjectProposal):
    return (
        db.query(ProposalReport)
        .filter(ProposalReport.proposal_id == proposal.id)
        .order_by(ProposalReport.report_no)
        .all()
    )


def attachments_for(db: Session, report_ids):
    """Attachments grouped by report id, in one query for a whole page."""
    ids = [int(i) for i in (report_ids or [])]
    if not ids:
        return {}
    rows = (
        db.query(ProposalReportAttachment)
        .filter(ProposalReportAttachment.report_id.in_(ids))
        .order_by(ProposalReportAttachment.id)
        .all()
    )
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row.report_id, []).append(row)
    return grouped


def submit_report(
    db: Session,
    proposal: ProjectProposal,
    *,
    narrative: str,
    submitted_ip: str = None,
    submitted_by_staff: str | None = None,
):
    """Append the next completion report and send the dossier for review.

    `submitted_by_staff` is the admin who filed it from the portal on the
    team's behalf, if one did.

    Allowed only from `funded` or `report_changes_requested`: before funding
    there is nothing to report on, and after `completed` the dossier is closed.

    MAX+1, not COUNT+1, for the same reason the version chain uses it: a gap in
    the numbering would make COUNT+1 collide with a report that already exists
    and break the dossier permanently.
    """
    text = (narrative or "").strip()
    if not text:
        raise ProposalError("A completion report needs a description of what was done.")

    if proposal.status not in REPORT_SUBMITTABLE_STATUSES:
        if proposal.status == COMPLETED:
            raise ProposalNotFunded(
                f"Proposal #{proposal.id} is already completed."
            )
        if proposal.status == REPORT_SUBMITTED:
            raise ProposalNotFunded(
                f"A report for proposal #{proposal.id} is already awaiting review."
            )
        raise ProposalNotFunded(
            f"Proposal #{proposal.id} is '{proposal.status}'; a completion "
            f"report can only be submitted once it has been funded."
        )

    highest = (
        db.query(func.max(ProposalReport.report_no))
        .filter(ProposalReport.proposal_id == proposal.id)
        .scalar()
    )
    report = ProposalReport(
        proposal_id=proposal.id,
        report_no=(highest or 0) + 1,
        narrative=text,
        submitted_ip=submitted_ip or None,
        submitted_by_staff=submitted_by_staff or None,
    )
    db.add(report)
    db.flush()

    proposal.current_report_id = report.id
    proposal.status = REPORT_SUBMITTED
    # A fresh submission has not been reviewed. Clearing the stamp keeps the
    # admin list from sorting it as though a decision had just been taken.
    proposal.reviewed_at = None
    proposal.reviewed_by = None
    db.commit()
    db.refresh(proposal)
    db.refresh(report)
    return report


def add_report_attachment(
    db: Session, report: ProposalReport, *, checked, object_key: str
):
    """Persist metadata for a file already written to S3.

    `checked` is a report_attachments.CheckedAttachment, so content_type and
    kind are what the bytes proved rather than what the client declared.
    """
    attachment = ProposalReportAttachment(
        report_id=report.id,
        filename=checked.filename,
        object_key=object_key,
        content_type=checked.content_type,
        kind=checked.kind,
        size_bytes=checked.size_bytes,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def record_report_decision(
    db: Session,
    proposal: ProjectProposal,
    *,
    decision: str,
    decision_comment: str = None,
    internal_note: str = None,
    reviewer_id=None,
):
    """Accept the completion report, or send it back with a reason.

    Accepting closes the dossier (`completed`) and releases the applicant to
    apply again. Sending it back moves to `report_changes_requested`, from which
    the team submits a corrected report — which is the only way out for a
    report that is incomplete, since the dossier otherwise blocks them forever.
    """
    if decision not in REPORT_DECISIONS:
        raise InvalidProposalStatus(
            f"A report decision must be one of {sorted(REPORT_DECISIONS)}; "
            f"got '{decision}'."
        )

    report = current_report(db, proposal)
    if report is None:
        raise NoReportToDecide(
            f"Proposal #{proposal.id} has no completion report to decide on.")
    if proposal.status != REPORT_SUBMITTED:
        raise NoReportToDecide(
            f"Proposal #{proposal.id} is '{proposal.status}'; there is no "
            f"report awaiting review."
        )

    if decision == "changes_requested":
        effective = (decision_comment if decision_comment is not None
                     else report.decision_comment)
        if not (effective or "").strip():
            raise ReportCommentRequired(
                "Sending a report back requires a message for the team — it "
                "goes out in the email, and it is the only thing telling them "
                "what to fix."
            )

    if decision_comment is not None:
        report.decision_comment = decision_comment.strip() or None
    if internal_note is not None:
        report.internal_note = internal_note.strip() or None

    report.decision = decision
    report.decided_at = datetime.utcnow()
    report.decided_by = reviewer_id

    proposal.status = COMPLETED if decision == "approved" else REPORT_CHANGES_REQUESTED
    proposal.reviewed_at = datetime.utcnow()
    proposal.reviewed_by = reviewer_id
    db.commit()
    db.refresh(proposal)
    db.refresh(report)
    return report


# -------------------------------------------------------------------
# Serializers
# -------------------------------------------------------------------

def serialize_attachment(attachment) -> dict[str, Any]:
    """Metadata only. The bytes are served by an authenticated endpoint; no S3
    key or signed URL is ever handed to a client."""
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "kind": attachment.kind,
        "size_bytes": attachment.size_bytes,
        "uploaded_at": attachment.uploaded_at,
    }


def serialize_report(report, *, attachments=None, staff: bool = False) -> dict[str, Any]:
    """One report. `staff=True` adds the fields the team must not see."""
    out: dict[str, Any] = {
        "id": report.id,
        "proposal_id": report.proposal_id,
        "report_no": report.report_no,
        "narrative": report.narrative,
        "submitted_at": report.submitted_at,
        "decision": report.decision,
        "decision_comment": report.decision_comment,
        "decided_at": report.decided_at,
        "attachments": [serialize_attachment(a) for a in (attachments or [])],
    }
    if staff:
        out["internal_note"] = report.internal_note
        out["decided_by"] = report.decided_by
        out["submitted_ip"] = report.submitted_ip
        out["submitted_by_staff"] = report.submitted_by_staff
    return out

