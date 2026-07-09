"""Audience segment CRUD + preview-count + sample (admin only)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from logging_config import get_logger
from marketing.audience import preview_segment
from models import AudienceSegment, User

logger = get_logger(__name__)
router = APIRouter()


class SegmentDefinition(BaseModel):
    """Single predicate row inside a segment definition."""
    field: str
    op: str
    value: object | None = None


class SegmentDefinitionGroup(BaseModel):
    """Container that groups a list of rules with an AND/OR operator.

    This is the new shape (P3d). The legacy plain-list shape is still
    accepted and treated as AND for backwards compatibility.
    """
    operator: str = Field(default="AND", pattern=r"^(AND|OR)$")
    rules: list[SegmentDefinition] = Field(default_factory=list)


# The frontend can send EITHER shape. Both are handled by the compiler's
# _normalize_definition() at the audience layer.
SegmentDefinitionShape = Union[list[SegmentDefinition], SegmentDefinitionGroup]


class SegmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    definition: SegmentDefinitionShape = Field(default_factory=list)


class SegmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[SegmentDefinitionShape] = None


def _serialize(s: AudienceSegment) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "definition": s.definition or [],
        "cached_count": s.cached_count,
        "cached_count_at": s.cached_count_at,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _serialize_definition(definition: SegmentDefinitionShape) -> Union[list, dict]:
    """Return a JSON-serialisable representation. Preserves the shape the
    caller sent — list stays list, group stays group — so we don't
    silently rewrite existing segments."""
    if isinstance(definition, list):
        return [d.model_dump() if hasattr(d, "model_dump") else d for d in definition]
    # SegmentDefinitionGroup
    return definition.model_dump() if hasattr(definition, "model_dump") else definition


def _refresh_cached_count(db: Session, segment: AudienceSegment) -> None:
    """Recompute and persist the cached audience count for a segment."""
    try:
        preview = preview_segment(db, segment.definition or [], sample_size=0)
        segment.cached_count = preview["count"]
        segment.cached_count_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        logger.warning("Could not refresh count for segment %s: %s", segment.id, exc)


@router.get("/segments")
async def list_segments(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    rows = db.query(AudienceSegment).order_by(AudienceSegment.updated_at.desc()).all()
    return [_serialize(s) for s in rows]


@router.get("/segments/{segment_id}")
async def get_segment(
    segment_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    s = db.query(AudienceSegment).filter(AudienceSegment.id == segment_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    return _serialize(s)


@router.post("/segments", status_code=status.HTTP_201_CREATED)
async def create_segment(
    payload: SegmentCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    s = AudienceSegment(
        name=payload.name,
        description=payload.description,
        definition=_serialize_definition(payload.definition),
        created_by=current_admin.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    _refresh_cached_count(db, s)
    return _serialize(s)


@router.put("/segments/{segment_id}")
async def update_segment(
    segment_id: int,
    payload: SegmentUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    s = db.query(AudienceSegment).filter(AudienceSegment.id == segment_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    data = payload.model_dump(exclude_unset=True)
    # `definition` already came out of model_dump as native Python types
    # (list of dicts, or dict with 'operator'/'rules'). Just pass through.
    for field, value in data.items():
        setattr(s, field, value)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    _refresh_cached_count(db, s)
    return _serialize(s)


@router.delete("/segments/{segment_id}")
async def delete_segment(
    segment_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    s = db.query(AudienceSegment).filter(AudienceSegment.id == segment_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


@router.post("/segments/preview")
async def preview_segment_endpoint(
    payload: SegmentCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Preview a segment definition WITHOUT saving it.

    Returns the matching count and a small sample of recipients. Used by the
    Segment builder UI to give live feedback as the admin edits the rules.
    """
    try:
        # _normalize_definition inside preview_segment handles either shape.
        result = preview_segment(db, _serialize_definition(payload.definition), sample_size=10)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# Provide a list of available fields + ops so the frontend builder can render
# a dropdown without hardcoding the list.
@router.get("/segments/_meta/fields")
async def segment_meta(current_admin: User = Depends(get_current_admin)):
    return {
        "fields": [
            {"id": "email", "label": "Email", "type": "string"},
            {"id": "name", "label": "Name", "type": "string"},
            {"id": "has_email_consent", "label": "Has email consent", "type": "bool"},
            {"id": "sms_consent", "label": "Has SMS consent", "type": "bool"},
            {
                "id": "sources",
                "label": "Source / list",
                "type": "enum",
                "hint": "Where this contact came from — pick one source",
                "options": [
                    {"value": "user",         "label": "Registered users"},
                    {"value": "subscription", "label": "Newsletter subscribers"},
                    {"value": "volunteer",    "label": "Volunteers"},
                    {"value": "donor",        "label": "One-time donors"},
                    {"value": "recurring",    "label": "Recurring donors"},
                ],
            },
            {"id": "total_donated", "label": "Total donated ($)", "type": "number"},
            {"id": "donation_count", "label": "Number of donations", "type": "number"},
            {"id": "last_donation_at", "label": "Last donation date", "type": "date"},
        ],
        "ops_by_type": {
            "string": ["eq", "neq", "contains", "in", "not_in", "is_null", "is_not_null"],
            "number": ["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "is_not_null"],
            "bool":   ["is_true", "is_false"],
            "enum":   ["contains", "neq"],  # 'contains' is the natural fit for the comma-joined sources string
            "date":   ["gt", "gte", "lt", "lte", "is_null", "is_not_null"],
        },
    }
