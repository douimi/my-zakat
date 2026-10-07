"""Project proposals router — public submission + admin review + PDF export.

Endpoints
─────────
Public (no auth):
  POST   /api/project-proposals/                     → open a dossier (version 1)

Admin / manager (auth):
  GET    /api/project-proposals/                     → list, current content flattened
  GET    /api/project-proposals/{id}                 → dossier + version history
  GET    /api/project-proposals/{id}/versions/{n}    → one frozen version
  PATCH  /api/project-proposals/{id}/status          → record a decision, email the applicant
  DELETE /api/project-proposals/{id}                 → delete the dossier and its versions
  GET    /api/project-proposals/{id}/pdf             → PDF of the current version
  GET    /api/project-proposals/{id}/versions/{n}/pdf→ PDF of that version
  GET    /api/project-proposals/unread-count         → badge count for the admin nav
  POST   /api/project-proposals/{id}/seen            → mark the current version read
  GET    /api/project-proposals/{id}/agreement       → saved agreement, or a draft
  PUT    /api/project-proposals/{id}/agreement       → create/update the agreement
  GET    /api/project-proposals/{id}/agreement/pdf   → the signed-ready agreement

The submitter-facing half of this feature lives in routers/proposal_portal.py.
Domain rules live in proposal_service.py; this module only maps HTTP to them.
"""
from __future__ import annotations

import io
import logging
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

import email_service
import proposal_service
from auth_utils import get_current_manager_or_admin
from database import get_db
from logging_config import get_logger, mask_email
from agreement_pdf import render_agreement_pdf
from models import ProjectProposal, ProposalVersion, User
from proposal_pdf import render_proposal_pdf, safe_slug
from proposal_service import (
    AgreementIncomplete,
    DecisionCommentRequired,
    InvalidProposalStatus,
    ProposalError,
    ProposalNotApproved,
)
import log_events as ev

logger = get_logger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class ProposalSubmit(BaseModel):
    # Section 1: Personal
    full_name: str = Field(min_length=2, max_length=200)
    national_id: str = Field(min_length=2, max_length=50)
    date_of_birth_year: int = Field(ge=1900, le=2020)
    place_of_residence: str = Field(min_length=2, max_length=300)
    mobile_number: str = Field(min_length=5, max_length=50)
    email: EmailStr
    educational_level: str = Field(min_length=2, max_length=200)

    # Section 2: Project
    project_name: str = Field(min_length=2, max_length=300)
    project_description: str = Field(min_length=10)
    problem_solved: str = Field(min_length=10)
    target_beneficiaries: str = Field(min_length=5)
    community_impact: str = Field(min_length=10)
    expected_impact: str = Field(min_length=10)

    # Section 3: Plan
    implementation_steps: str = Field(min_length=5)
    implementation_location: str = Field(min_length=5)
    required_materials: str = Field(min_length=5)
    expected_duration: str = Field(min_length=2, max_length=300)
    continuity_plan: str = Field(min_length=10)
    feasibility: str = Field(min_length=10)
    expected_challenges: str = Field(min_length=10)

    # Section 4: Budget
    number_of_beneficiaries: int = Field(ge=1)
    cost_per_unit_usd: float = Field(gt=0)
    unit_type: str = Field(min_length=1, max_length=50)
    additional_expenses_usd: float = Field(ge=0, default=0)
    additional_expenses_description: Optional[str] = None
    total_amount_usd: float = Field(gt=0)

    # Optional SMS consent (10DLC / TCR compliance). Consent is NOT required
    # to submit a proposal — the checkbox on the form is unchecked by default.
    # When the applicant ticks it, we record the exact wording they agreed to
    # so we can prove opt-in later.
    sms_consent: bool = False
    sms_consent_text: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("total_amount_usd")
    @classmethod
    def total_matches_breakdown(cls, v, info):
        # Sanity check: allow a $1 rounding drift between the client's total
        # and the server-side recomputation. Anything larger is a client bug
        # or tampering — we recompute either way when serving the PDF.
        data = info.data
        computed = (data.get("number_of_beneficiaries", 0) or 0) * (data.get("cost_per_unit_usd", 0) or 0) \
                 + (data.get("additional_expenses_usd", 0) or 0)
        if abs(v - computed) > 1.00:
            raise ValueError(f"Total amount ({v}) does not match breakdown ({computed:.2f}).")
        return v


class ProposalStatusUpdate(BaseModel):
    status: str
    # Shown to the applicant and quoted in the decision email. Omit to leave
    # the existing comment untouched (the "save internal note only" path).
    decision_comment: Optional[str] = None
    internal_note: Optional[str] = None


def client_ip(request: Request) -> str:
    """Caller's IP, honouring the proxy header Traefik sets."""
    xff = request.headers.get("x-forwarded-for")
    raw = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")
    return raw[:45]


def _load(db: Session, proposal_id: int) -> ProjectProposal:
    found = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not found:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return found


def _load_version(db: Session, dossier: ProjectProposal, version_no: int) -> ProposalVersion:
    version = (
        db.query(ProposalVersion)
        .filter(
            ProposalVersion.proposal_id == dossier.id,
            ProposalVersion.version_no == version_no,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


# ── Public: submit ───────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def submit_proposal(payload: ProposalSubmit, request: Request, db: Session = Depends(get_db)):
    """Public endpoint anyone can call. Always opens a NEW dossier.

    A revision of an existing dossier goes through the portal
    (PUT /api/project-proposals/portal/{id}), never through here.
    """
    data = payload.model_dump()
    dossier, version = proposal_service.create_proposal(
        db,
        content=data,
        submitted_ip=client_ip(request),
        sms_consent=bool(data.get("sms_consent")),
        sms_consent_text=data.get("sms_consent_text"),
    )
    logger.event(
        ev.PROPOSAL_SUBMITTED, "a new project proposal was submitted",
        proposal_id=dossier.id, version_no=version.version_no,
        email=mask_email(dossier.email),
        project=version.project_name[:80],
        sms_consent=bool(version.sms_consent),
    )
    email_service.send_proposal_received(
        email=dossier.email,
        name=version.full_name,
        proposal_id=dossier.id,
        version_no=version.version_no,
        project_name=version.project_name,
    )
    return {
        "id": dossier.id,
        "version_no": version.version_no,
        "message": "Your proposal has been submitted. Our team will review it and get back to you.",
        "submitted_at": version.submitted_at,
    }


# ── Admin: list / get / update / delete ──────────────────────────────

class AgreementUpdate(BaseModel):
    """What the reviewer may set on the agreement.

    Every field optional: the drawer saves the whole form, but a caller that
    sends only the two distribution lines must not blank the rest. The service
    layer ignores keys outside its own allow-list, so an unexpected field here
    cannot reach the ORM.
    """
    project_title: Optional[str] = Field(default=None, max_length=300)
    location: Optional[str] = Field(default=None, max_length=300)
    field_representative: Optional[str] = Field(default=None, max_length=200)
    approved_funding_usd: Optional[float] = Field(default=None, ge=0)
    target_count: Optional[int] = Field(default=None, ge=1)
    target_label: Optional[str] = Field(default=None, max_length=120)
    distribution_per_beneficiary: Optional[str] = None
    total_planned_distribution: Optional[str] = None
    extra_fund_uses: Optional[str] = None


# ── Unread tracking ──────────────────────────────────────────────────
# Declared BEFORE /{proposal_id}: FastAPI matches routes in declaration order,
# and "unread-count" would otherwise be captured by the int path parameter and
# answered with a 422.

@router.get("/unread-count")
async def proposals_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """How many dossiers nobody has opened since their latest submission."""
    return {"count": proposal_service.unread_count(db)}


@router.get("/")
async def list_proposals(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    q = db.query(ProjectProposal)
    if status_filter and status_filter in proposal_service.VALID_STATUSES:
        q = q.filter(ProjectProposal.status == status_filter)
    total = q.count()
    rows = (
        q.order_by(ProjectProposal.updated_at.desc())
        .offset(skip)
        .limit(min(limit, 500))
        .all()
    )
    # Two queries for the whole page, not one per row.
    grouped = proposal_service.versions_by_proposal(db, [r.id for r in rows])
    items = []
    for row in rows:
        versions = grouped.get(row.id, [])
        # Follow the same pointer the detail endpoint follows, so the two admin
        # views can never disagree about which version is current. The fallback
        # to the highest version matches current_version()'s own fallback for
        # rows migration 32 has not yet stamped.
        by_id = {v.id: v for v in versions}
        current = by_id.get(row.current_version_id) or (versions[-1] if versions else None)
        items.append(
            proposal_service.serialize_for_admin(row, current, db=db, versions=versions)
        )
    return {"total": total, "items": items}


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    return proposal_service.serialize_for_admin(
        dossier, proposal_service.current_version(db, dossier), db=db
    )


@router.get("/{proposal_id}/versions/{version_no}")
async def get_proposal_version(
    proposal_id: int,
    version_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    version = _load_version(db, dossier, version_no)
    return proposal_service.serialize_version_detail(dossier, version)


@router.patch("/{proposal_id}/status")
async def update_proposal_status(
    proposal_id: int,
    payload: ProposalStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Record the reviewer's decision and notify the applicant.

    The email goes out only when the status actually changes, so re-saving an
    internal note on an already-rejected dossier does not re-notify anyone.
    """
    dossier = _load(db, proposal_id)
    previous_status = dossier.status
    try:
        version = proposal_service.record_decision(
            db, dossier,
            status=payload.status,
            decision_comment=payload.decision_comment,
            internal_note=payload.internal_note,
            reviewer_id=current_user.id,
        )
    except (InvalidProposalStatus, DecisionCommentRequired) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ProposalError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    logger.event(
        ev.PROPOSAL_DECIDED, "a proposal decision was recorded",
        proposal_id=dossier.id, decision=dossier.status,
        previous_status=previous_status, version_no=version.version_no,
        amount=float(version.total_amount_usd or 0),
        actor=mask_email(current_user.email),
    )

    if previous_status != dossier.status:
        _notify_decision(dossier, version)

    return proposal_service.serialize_for_admin(dossier, version, db=db)


def _notify_decision(dossier: ProjectProposal, version: ProposalVersion) -> None:
    """Queue the one email that matches the new status. Never raises."""
    senders = {
        "approved": email_service.send_proposal_approved,
        "rejected": email_service.send_proposal_rejected,
        "changes_requested": email_service.send_proposal_changes_requested,
    }
    send = senders.get(dossier.status)
    if send is None:
        return  # 'submitted' / 'under_review' are not worth an email
    try:
        send(
            email=dossier.email,
            name=version.full_name,
            proposal_id=dossier.id,
            version_no=version.version_no,
            project_name=version.project_name,
            comment=version.decision_comment or "",
        )
    except Exception:
        # A queueing failure must not roll back a decision the reviewer just made.
        logger.exception("Could not queue the decision email for proposal #%s", dossier.id)


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    proposal_service.delete_proposal(db, dossier)
    logger.info("Proposal #%s deleted by %s", proposal_id, current_user.email)
    return {"deleted": True}


# ── Admin: PDF export ────────────────────────────────────────────────

@router.get("/{proposal_id}/pdf")
async def download_proposal_pdf(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    version = proposal_service.current_version(db, dossier)
    if version is None:
        raise HTTPException(status_code=404, detail="Proposal has no content to export")
    return _pdf_response(dossier, version)


@router.get("/{proposal_id}/versions/{version_no}/pdf")
async def download_proposal_version_pdf(
    proposal_id: int,
    version_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    return _pdf_response(dossier, _load_version(db, dossier, version_no))


def _pdf_response(dossier: ProjectProposal, version: ProposalVersion) -> StreamingResponse:
    """Render one version, stamped with the dossier's reference and status.

    The renderer takes a single duck-typed object, so the dossier's identity has
    to travel with the version's content. That is done by copying both into a
    throwaway namespace rather than by assigning onto the ProposalVersion: its
    `id` is a mapped primary key, and setting it would leave a persisted row's
    PK dirty in the identity map, one stray flush away from an UPDATE that
    rewrites the wrong row.

    The footer therefore shows the dossier's CURRENT status even on an exported
    older version, while that version's own verdict stays in its `decision`
    field. That is deliberate: the reader needs to know where the file stands
    now, not only what was decided about this particular draft.
    """
    view = SimpleNamespace(
        **{column.name: getattr(version, column.name) for column in version.__table__.columns}
    )
    view.id = dossier.id
    view.status = dossier.status
    pdf_bytes = render_proposal_pdf(view)
    filename = f"proposal-{dossier.id}-v{version.version_no}-{safe_slug(version.project_name)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



# ── Mark a dossier read ──────────────────────────────────────────────

@router.post("/{proposal_id}/seen")
async def mark_proposal_seen(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Record that this reviewer has opened the dossier's current version.

    Idempotent, and returns the fresh badge count either way so the admin nav
    can update from the same round trip the drawer already makes.
    """
    dossier = _load(db, proposal_id)
    changed = proposal_service.mark_seen(db, dossier)
    if changed:
        logger.event(
            ev.PROPOSAL_SEEN, "an admin opened a proposal",
            proposal_id=dossier.id, version_id=dossier.current_version_id,
            actor=mask_email(current_user.email),
        )
    return {
        "proposal_id": dossier.id,
        "is_unread": proposal_service.is_unread(dossier),
        "unread_count": proposal_service.unread_count(db),
    }


# ── Funding agreement ────────────────────────────────────────────────

@router.get("/{proposal_id}/agreement")
async def get_proposal_agreement(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """The saved agreement if there is one, otherwise a pre-filled draft.

    `exists` tells the drawer which it is looking at, so it can label the
    button "Generate" or "Update" without guessing from the field values.
    `version_drifted` flags an agreement drawn from a version the dossier has
    since moved past — the contract may no longer match what was approved.
    """
    dossier = _load(db, proposal_id)
    agreement = proposal_service.get_agreement(db, dossier)
    if agreement is not None:
        return {
            "exists": True,
            "proposal_status": dossier.status,
            "version_drifted": (
                agreement.version_id is not None
                and agreement.version_id != dossier.current_version_id
            ),
            "agreement": proposal_service.serialize_agreement(agreement),
        }
    version = proposal_service.current_version(db, dossier)
    return {
        "exists": False,
        "proposal_status": dossier.status,
        "version_drifted": False,
        "agreement": proposal_service.agreement_draft(dossier, version),
    }


@router.put("/{proposal_id}/agreement")
async def put_proposal_agreement(
    proposal_id: int,
    payload: AgreementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    try:
        agreement = proposal_service.save_agreement(
            db, dossier,
            fields=payload.model_dump(exclude_unset=True),
            reviewer_id=current_user.id,
        )
    except ProposalNotApproved as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except AgreementIncomplete as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    logger.event(
        ev.AGREEMENT_SAVED, "funding agreement saved",
        proposal_id=dossier.id, agreement_id=agreement.id,
        amount=float(agreement.approved_funding_usd or 0),
        actor=mask_email(current_user.email),
    )
    return {
        "exists": True,
        "proposal_status": dossier.status,
        "version_drifted": (
            agreement.version_id is not None
            and agreement.version_id != dossier.current_version_id
        ),
        "agreement": proposal_service.serialize_agreement(agreement),
    }


@router.get("/{proposal_id}/agreement/pdf")
async def download_proposal_agreement_pdf(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Render the agreement. First download stamps it as issued."""
    dossier = _load(db, proposal_id)
    agreement = proposal_service.get_agreement(db, dossier)
    if agreement is None:
        raise HTTPException(
            status_code=404,
            detail="No funding agreement has been prepared for this proposal yet.",
        )

    try:
        pdf = render_agreement_pdf(agreement)
    except Exception as exc:
        logger.event(
            ev.AGREEMENT_ISSUED, "could not render the funding agreement",
            level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
            reason=ev.REASON_PDF_FAILED, proposal_id=dossier.id,
            agreement_id=agreement.id,
        )
        raise HTTPException(status_code=500, detail="Could not render the agreement PDF.")

    first_issue = proposal_service.mark_agreement_issued(db, agreement)
    logger.event(
        ev.AGREEMENT_ISSUED, "funding agreement downloaded",
        outcome=ev.OUTCOME_SUCCESS, proposal_id=dossier.id,
        agreement_id=agreement.id, first_issue=first_issue,
        amount=float(agreement.approved_funding_usd or 0),
        actor=mask_email(current_user.email),
    )

    filename = "agreement-project-%s-%s.pdf" % (
        dossier.id, safe_slug(agreement.project_title))
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="%s"' % filename},
    )

