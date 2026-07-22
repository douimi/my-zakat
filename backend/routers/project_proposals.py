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

    p = ProjectProposal(
        **payload.model_dump(),
        status="submitted",
        submitted_ip=client_ip,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.info("Project proposal #%s submitted by %s (%s)", p.id, p.email, p.project_name[:60])
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

    pdf_bytes = _render_proposal_pdf(p)
    filename = f"proposal-{p.id}-{_safe_slug(p.project_name)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── PDF renderer (reportlab platypus) ────────────────────────────────

def _safe_slug(text: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9]+", "-", text or "proposal").strip("-").lower()[:40] or "proposal"


def _render_proposal_pdf(p: ProjectProposal) -> bytes:
    """Rebuild the paper form's four-section layout as a downloadable PDF."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title=f"Project Proposal — {p.project_name}",
        author=p.full_name,
    )

    styles = getSampleStyleSheet()
    h_style = ParagraphStyle(
        "SectionH", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#1e40af"),
        spaceAfter=8, spaceBefore=14,
    )
    sub_h = ParagraphStyle(
        "SubH", parent=styles["Heading2"],
        fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#111827"),
        spaceAfter=4, spaceBefore=10,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=10, leading=14, alignment=TA_LEFT,
        spaceAfter=6, textColor=colors.HexColor("#1f2937"),
    )
    meta = ParagraphStyle("Meta", parent=body, textColor=colors.HexColor("#6b7280"), fontSize=9)

    def para(text: str, style=body):
        # Escape < > & so freeform text doesn't break reportlab.
        safe = (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Preserve intentional newlines.
        safe = safe.replace("\n", "<br/>")
        return Paragraph(safe, style)

    def bullet_list(text: str):
        # Convert lines starting with -, *, or • into bullet items; otherwise
        # render as a single paragraph.
        lines = [ln.strip().lstrip("-•*").strip() for ln in (text or "").split("\n") if ln.strip()]
        if len(lines) <= 1:
            return para(text)
        return ListFlowable(
            [ListItem(para(ln), leftIndent=10) for ln in lines],
            bulletType="bullet", start="•", leftIndent=14,
        )

    def kv_table(rows):
        t = Table(
            [[para(f"<b>{k}</b>", meta), para(v or "—")] for k, v in rows],
            colWidths=[1.9 * inch, 4.6 * inch],
        )
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    story = []

    # ── Cover header ─────────────────────────────────────────
    story.append(Paragraph("<b>TO: ZAKAT DISTRIBUTION FOUNDATION</b>", h_style))
    story.append(para(f"<b>Subject:</b> Request for Funding Support for {p.project_name} — ${p.total_amount_usd:,.0f} USD"))
    story.append(para(f"<b>Date:</b> {p.submitted_at.strftime('%B %d, %Y')}"))
    story.append(Spacer(1, 8))
    story.append(para("Dear Sir/Madam,"))
    story.append(para(p.project_description))
    story.append(para(p.problem_solved))
    story.append(para(
        f"The total required budget for the project is ${p.total_amount_usd:,.2f} USD. "
        f"The implementation will be carried out in coordination with local community "
        f"committees to ensure efficient, transparent, and equitable distribution to "
        f"those most in need."
    ))
    story.append(para(p.expected_impact))
    story.append(para("Thank you for your consideration and continued commitment to humanitarian work."))
    story.append(Spacer(1, 8))
    story.append(para("Sincerely,"))
    story.append(para(f"<b>{p.full_name}</b>"))
    story.append(para(p.place_of_residence))
    story.append(para(f"Mobile: {p.mobile_number}"))
    story.append(para(f"Email: {p.email}"))

    # ── Section 1 ────────────────────────────────────────────
    story.append(Paragraph("FIRST: PERSONAL INFORMATION", h_style))
    story.append(kv_table([
        ("Full Name",           p.full_name),
        ("National ID Number",  p.national_id),
        ("Date of Birth",       str(p.date_of_birth_year)),
        ("Place of Residence",  p.place_of_residence),
        ("Mobile Number",       p.mobile_number),
        ("Email",               p.email),
        ("Educational Level",   p.educational_level),
    ]))

    # ── Section 2 ────────────────────────────────────────────
    story.append(Paragraph("SECOND: PROJECT INFORMATION", h_style))
    story.append(Paragraph("Project Name", sub_h)); story.append(para(p.project_name))
    story.append(Paragraph("Project Idea Description", sub_h)); story.append(para(p.project_description))
    story.append(Paragraph("What problem does the project solve?", sub_h)); story.append(para(p.problem_solved))
    story.append(Paragraph("Target Beneficiaries", sub_h)); story.append(para(p.target_beneficiaries))
    story.append(Paragraph("How will the project serve the community?", sub_h)); story.append(para(p.community_impact))
    story.append(Paragraph("Expected Economic or Social Impact", sub_h)); story.append(para(p.expected_impact))

    # ── Section 3 ────────────────────────────────────────────
    story.append(Paragraph("THIRD: PROJECT PLAN", h_style))
    story.append(Paragraph("What are the steps for implementing the project?", sub_h))
    story.append(bullet_list(p.implementation_steps))
    story.append(Paragraph("Where will the project be implemented?", sub_h)); story.append(para(p.implementation_location))
    story.append(Paragraph("What materials or equipment are needed?", sub_h))
    story.append(bullet_list(p.required_materials))
    story.append(Paragraph("Expected duration to start implementation", sub_h)); story.append(para(p.expected_duration))
    story.append(Paragraph("How will the project continue after funding?", sub_h)); story.append(para(p.continuity_plan))
    story.append(Paragraph("Why do you believe it is feasible under current conditions?", sub_h)); story.append(para(p.feasibility))
    story.append(Paragraph("Expected challenges and how to address them", sub_h))
    story.append(bullet_list(p.expected_challenges))

    # ── Section 4 ────────────────────────────────────────────
    story.append(Paragraph("FOURTH: REQUIRED BUDGET", h_style))
    story.append(Paragraph("Requested Funding Amount", sub_h))
    story.append(kv_table([
        (f"Number of {p.unit_type}s", str(p.number_of_beneficiaries)),
        (f"Cost per {p.unit_type}",   f"${p.cost_per_unit_usd:,.2f} USD"),
    ]))
    story.append(Paragraph("Calculation", sub_h))
    subtotal = float(p.number_of_beneficiaries) * float(p.cost_per_unit_usd)
    story.append(para(f"{p.number_of_beneficiaries} {p.unit_type}s × ${p.cost_per_unit_usd:,.2f} USD = ${subtotal:,.2f} USD"))
    if p.additional_expenses_usd:
        story.append(para(f"Additional expenses: ${float(p.additional_expenses_usd):,.2f} USD"
                          + (f" — {p.additional_expenses_description}" if p.additional_expenses_description else "")))
    story.append(para(f"<b>Total Required Amount: ${p.total_amount_usd:,.2f} USD</b>"))

    # ── Admin footer ─────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(para(
        f"— Submitted via myzakat.org on {p.submitted_at.strftime('%Y-%m-%d %H:%M UTC')} · "
        f"reference #{p.id} · status: {p.status.replace('_', ' ')}",
        style=meta,
    ))

    doc.build(story)
    return buf.getvalue()
