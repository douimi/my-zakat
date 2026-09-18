"""Project proposals router — public submission + admin review + PDF export.

Endpoints
─────────
Public (no auth):
  POST   /api/project-proposals/                  → submit a proposal

Admin / manager (auth):
  GET    /api/project-proposals/                  → list all
  GET    /api/project-proposals/{id}              → get one
  PATCH  /api/project-proposals/{id}/status       → update review status + admin note
  DELETE /api/project-proposals/{id}              → delete
  GET    /api/project-proposals/{id}/pdf          → download reconstructed PDF
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from auth_utils import get_current_manager_or_admin
from database import get_db
from logging_config import get_logger
from models import ProjectProposal, User
from proposal_pdf import render_proposal_pdf, safe_slug

logger = get_logger(__name__)
router = APIRouter()


VALID_STATUSES = {"submitted", "under_review", "approved", "rejected"}


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
    admin_notes: Optional[str] = None


def _serialize(p: ProjectProposal, *, include_admin: bool = False) -> dict:
    out = {
        "id": p.id,
        "full_name": p.full_name,
        "national_id": p.national_id,
        "date_of_birth_year": p.date_of_birth_year,
        "place_of_residence": p.place_of_residence,
        "mobile_number": p.mobile_number,
        "email": p.email,
        "educational_level": p.educational_level,
        "project_name": p.project_name,
        "project_description": p.project_description,
        "problem_solved": p.problem_solved,
        "target_beneficiaries": p.target_beneficiaries,
        "community_impact": p.community_impact,
        "expected_impact": p.expected_impact,
        "implementation_steps": p.implementation_steps,
        "implementation_location": p.implementation_location,
        "required_materials": p.required_materials,
        "expected_duration": p.expected_duration,
        "continuity_plan": p.continuity_plan,
        "feasibility": p.feasibility,
        "expected_challenges": p.expected_challenges,
        "number_of_beneficiaries": p.number_of_beneficiaries,
        "cost_per_unit_usd": float(p.cost_per_unit_usd),
        "unit_type": p.unit_type,
        "additional_expenses_usd": float(p.additional_expenses_usd or 0),
        "additional_expenses_description": p.additional_expenses_description,
        "total_amount_usd": float(p.total_amount_usd),
        "status": p.status,
        "submitted_at": p.submitted_at,
        "updated_at": p.updated_at,
    }
    if include_admin:
        out["admin_notes"] = p.admin_notes
        out["reviewed_at"] = p.reviewed_at
        out["reviewed_by"] = p.reviewed_by
        out["submitted_ip"] = p.submitted_ip
    return out


# ── Public: submit ───────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def submit_proposal(payload: ProposalSubmit, request: Request, db: Session = Depends(get_db)):
    """Public endpoint anyone can call. Creates a new proposal in 'submitted' state."""
    xff = request.headers.get("x-forwarded-for")
    client_ip = (xff.split(",")[0].strip() if xff else (request.client.host if request.client else ""))[:45]

    data = payload.model_dump()
    # Only stamp the SMS consent timestamp when the box was actually ticked.
    # If the client sent consent_text without consent=True, ignore the text
    # so we never record a false consent trail.
    if not data.get("sms_consent"):
        data["sms_consent_text"] = None
        sms_consent_at = None
    else:
        sms_consent_at = datetime.utcnow()

    p = ProjectProposal(
        **data,
        status="submitted",
        submitted_ip=client_ip,
        sms_consent_at=sms_consent_at,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.info(
        "Project proposal #%s submitted by %s (%s)%s",
        p.id, p.email, p.project_name[:60],
        " [SMS opt-in]" if p.sms_consent else "",
    )
    return {
        "id": p.id,
        "message": "Your proposal has been submitted. Our team will review it and get back to you.",
        "submitted_at": p.submitted_at,
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
    if status_filter and status_filter in VALID_STATUSES:
        q = q.filter(ProjectProposal.status == status_filter)
    total = q.count()
    rows = q.order_by(ProjectProposal.submitted_at.desc()).offset(skip).limit(min(limit, 500)).all()
    return {"total": total, "items": [_serialize(p, include_admin=True) for p in rows]}


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    p = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _serialize(p, include_admin=True)


@router.patch("/{proposal_id}/status")
async def update_proposal_status(
    proposal_id: int,
    payload: ProposalStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")
    p = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    p.status = payload.status
    if payload.admin_notes is not None:
        p.admin_notes = payload.admin_notes
    p.reviewed_at = datetime.utcnow()
    p.reviewed_by = current_user.id
    db.commit()
    db.refresh(p)
    logger.info("Proposal #%s status → %s by %s", p.id, p.status, current_user.email)
    return _serialize(p, include_admin=True)


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    p = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    db.delete(p)
    db.commit()
    logger.info("Proposal #%s deleted by %s", proposal_id, current_user.email)
    return {"deleted": True}


# ── Admin: PDF export (reconstructs the original 4-section layout) ──

@router.get("/{proposal_id}/pdf")
async def download_proposal_pdf(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    p = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")

    pdf_bytes = render_proposal_pdf(p)
    filename = f"proposal-{p.id}-{safe_slug(p.project_name)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
