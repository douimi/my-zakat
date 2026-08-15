"""Fundraising projects — public read + admin CRUD.

Public (no auth):
  GET  /api/fundraising-projects              → list active projects (homepage)
  GET  /api/fundraising-projects/{slug}       → single project by slug

Admin (requires admin):
  GET  /api/fundraising-projects/admin/list   → all projects incl. inactive
  POST/PUT/DELETE + /adjust-spent quick-action
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from logging_config import get_logger
from models import FundraisingProject, User

logger = get_logger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────

def _serialize(p: FundraisingProject) -> dict:
    remaining_cents = max(0, (p.goal_cents or 0) - (p.spent_cents or 0))
    goal = (p.goal_cents or 0) / 100.0
    spent = (p.spent_cents or 0) / 100.0
    remaining = remaining_cents / 100.0
    progress = 0.0
    if p.goal_cents and p.goal_cents > 0:
        progress = min(100.0, round((p.spent_cents or 0) / p.goal_cents * 100, 1))
    return {
        "id": p.id,
        "title": p.title,
        "slug": p.slug,
        "short_description": p.short_description,
        "description": p.description,
        "image_url": p.image_url,
        "goal_amount": goal,
        "spent_amount": spent,
        "remaining_amount": remaining,
        "progress_percent": progress,
        "currency": p.currency or "USD",
        "suggested_donation": ((p.suggested_donation_cents or 0) / 100.0) if p.suggested_donation_cents else None,
        "deadline": p.deadline,
        "status": p.status,
        "display_order": p.display_order,
        "is_active": p.is_active,
        "is_featured": p.is_featured,
        "category": p.category,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def _to_cents(value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(float(value) * 100))


# ── Schemas ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9-]+$")
    short_description: str = Field(min_length=1)
    description: Optional[str] = None
    image_url: Optional[str] = None
    goal_amount: float = Field(gt=0)
    spent_amount: float = Field(default=0, ge=0)
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    suggested_donation: Optional[float] = Field(default=None, gt=0)
    deadline: Optional[datetime] = None
    status: str = Field(default="active", pattern=r"^(active|completed|paused)$")
    display_order: int = Field(default=0)
    is_active: bool = True
    is_featured: bool = False
    category: Optional[str] = Field(default=None, max_length=100)


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = Field(default=None, pattern=r"^[a-z0-9-]+$")
    short_description: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    goal_amount: Optional[float] = Field(default=None, gt=0)
    spent_amount: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, pattern=r"^[A-Z]{3}$")
    suggested_donation: Optional[float] = Field(default=None, ge=0)
    deadline: Optional[datetime] = None
    status: Optional[str] = Field(default=None, pattern=r"^(active|completed|paused)$")
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    category: Optional[str] = None


class SpentAdjust(BaseModel):
    """Quick action: increment or overwrite spent amount without touching the rest."""
    spent_amount: Optional[float] = Field(default=None, ge=0)
    delta_amount: Optional[float] = None


# ── Public endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_public(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """Homepage feed — active projects by default.

    When `include_inactive=true` the public /projects catalog also receives
    archived / hidden projects so donors can see the foundation's full track
    record. Active projects are always returned first (featured, then by
    display order), followed by inactive ones ordered by newest updates.
    """
    q = db.query(FundraisingProject)
    if not include_inactive:
        q = q.filter(FundraisingProject.is_active == True)  # noqa: E712
    rows = q.order_by(
        FundraisingProject.is_active.desc(),
        FundraisingProject.is_featured.desc(),
        FundraisingProject.display_order.asc(),
        FundraisingProject.id.asc(),
    ).all()
    return [_serialize(p) for p in rows]


@router.get("/by-slug/{slug}")
async def get_by_slug(slug: str, db: Session = Depends(get_db)):
    p = db.query(FundraisingProject).filter(FundraisingProject.slug == slug).first()
    if not p or not p.is_active:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize(p)


# ── Admin endpoints ─────────────────────────────────────────────────

@router.get("/admin/list")
async def list_admin(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    rows = (
        db.query(FundraisingProject)
        .order_by(FundraisingProject.display_order.asc(), FundraisingProject.id.desc())
        .all()
    )
    return [_serialize(p) for p in rows]


@router.get("/{project_id}")
async def get_admin(
    project_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    p = db.query(FundraisingProject).filter(FundraisingProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize(p)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if db.query(FundraisingProject).filter(FundraisingProject.slug == payload.slug).first():
        raise HTTPException(status_code=400, detail="A project with this slug already exists")
    p = FundraisingProject(
        title=payload.title,
        slug=payload.slug,
        short_description=payload.short_description,
        description=payload.description,
        image_url=payload.image_url,
        goal_cents=_to_cents(payload.goal_amount),
        spent_cents=_to_cents(payload.spent_amount) or 0,
        currency=payload.currency,
        suggested_donation_cents=_to_cents(payload.suggested_donation),
        deadline=payload.deadline,
        status=payload.status,
        display_order=payload.display_order,
        is_active=payload.is_active,
        is_featured=payload.is_featured,
        category=payload.category,
        created_by=current_admin.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.info("Admin %s created project %s (%s)", current_admin.email, p.id, p.slug)
    return _serialize(p)


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    p = db.query(FundraisingProject).filter(FundraisingProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    data = payload.model_dump(exclude_unset=True)

    if "slug" in data and data["slug"] != p.slug:
        clash = db.query(FundraisingProject).filter(
            FundraisingProject.slug == data["slug"], FundraisingProject.id != project_id
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail="Slug already in use")

    # Map dollars → cents for money fields.
    for money_field, cents_field in (
        ("goal_amount", "goal_cents"),
        ("spent_amount", "spent_cents"),
        ("suggested_donation", "suggested_donation_cents"),
    ):
        if money_field in data:
            val = data.pop(money_field)
            setattr(p, cents_field, _to_cents(val))

    for field, value in data.items():
        setattr(p, field, value)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.post("/{project_id}/adjust-spent")
async def adjust_spent(
    project_id: int,
    payload: SpentAdjust,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Quick action for the common workflow: bump spent by $N or set it exactly."""
    p = db.query(FundraisingProject).filter(FundraisingProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.spent_amount is not None:
        p.spent_cents = _to_cents(payload.spent_amount) or 0
    elif payload.delta_amount is not None:
        delta = _to_cents(payload.delta_amount) or 0
        p.spent_cents = max(0, (p.spent_cents or 0) + delta)
    else:
        raise HTTPException(status_code=400, detail="Provide spent_amount or delta_amount")

    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    p = db.query(FundraisingProject).filter(FundraisingProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(p)
    db.commit()
    return {"deleted": True}
