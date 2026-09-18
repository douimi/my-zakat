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

The submitter-facing half of this feature lives in routers/proposal_portal.py.
Domain rules live in proposal_service.py; this module only maps HTTP to them.
"""
from __future__ import annotations

import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

import email_service
import proposal_service
from auth_utils import get_current_manager_or_admin
from database import get_db
from logging_config import get_logger
from models import ProjectProposal, ProposalVersion, User
from proposal_pdf import render_proposal_pdf, safe_slug
from proposal_service import (
    DecisionCommentRequired,
    InvalidProposalStatus,
    ProposalError,
)

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
    logger.info(
        "Project proposal #%s submitted by %s (%s)%s",
        dossier.id, dossier.email, version.project_name[:60],
        " [SMS opt-in]" if version.sms_consent else "",
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
        current = versions[-1] if versions else None
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

    logger.info("Proposal #%s status → %s by %s", dossier.id, dossier.status, current_user.email)

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

    The renderer is duck-typed on a single object, so the dossier's identity is
    attached to the version in memory rather than threaded through every
    reportlab call. Nothing is persisted: these attributes are not columns.
    """
    version.id = dossier.id
    version.status = dossier.status
    pdf_bytes = render_proposal_pdf(version)
    filename = f"proposal-{dossier.id}-v{version.version_no}-{safe_slug(version.project_name)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
