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

from sqlalchemy.orm import Session

from models import ProjectProposal, ProposalVersion

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

VALID_STATUSES = frozenset(
    {"submitted", "under_review", "changes_requested", "approved", "rejected"}
)
# Statuses that constitute a decision on the current version.
DECISION_STATUSES = frozenset({"approved", "rejected", "changes_requested"})
# Decisions the submitter must be given a reason for.
COMMENT_REQUIRED_STATUSES = frozenset({"rejected", "changes_requested"})
# The one status from which a submitter may send a new version.
EDITABLE_STATUSES = frozenset({"changes_requested"})


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
    """
    fields = _content_only(content)
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
) -> ProposalVersion:
    """Append the next version and send the dossier back for review.

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

    next_no = (
        db.query(ProposalVersion)
        .filter(ProposalVersion.proposal_id == proposal.id)
        .count()
        + 1
    )
    version = ProposalVersion(
        proposal_id=proposal.id,
        version_no=next_no,
        submitted_ip=submitted_ip or None,
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
    """
    if status not in VALID_STATUSES:
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
        version.decision = status
        version.decided_at = datetime.utcnow()
        version.decided_by = reviewer_id
    else:
        # Back to an open state: this version is awaiting a verdict again.
        version.decision = None
        version.decided_at = None
        version.decided_by = None

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
    """The content fields of a version, with the numeric ones as plain floats."""
    if version is None:
        return {key: None for key in PROPOSAL_CONTENT_FIELDS}
    out = {key: getattr(version, key) for key in PROPOSAL_CONTENT_FIELDS}
    out["cost_per_unit_usd"] = float(version.cost_per_unit_usd or 0)
    out["additional_expenses_usd"] = float(version.additional_expenses_usd or 0)
    out["total_amount_usd"] = float(version.total_amount_usd or 0)
    return out


def serialize_version_summary(version: ProposalVersion) -> dict[str, Any]:
    """One entry in the admin's version history. Staff-only fields included."""
    return {
        "id": version.id,
        "version_no": version.version_no,
        "submitted_at": version.submitted_at,
        "submitted_ip": version.submitted_ip,
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
    db: Session,
    versions: list[ProposalVersion] | None = None,
) -> dict[str, Any]:
    """Dossier + current content flattened + the full version history.

    The content is flattened rather than nested so the existing admin page keeps
    rendering unchanged; `versions` is the new part. Pass `versions` when the
    caller has already loaded them in bulk (the list endpoint does) to avoid a
    query per row.
    """
    if versions is None:
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
        "decision_comment": version.decision_comment if version else None,
        "content": _content_dict(version),
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
