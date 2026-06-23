"""Email template CRUD + render preview + send-test endpoints (admin only)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from logging_config import get_logger
from marketing.mailer import enqueue_email
from marketing.renderer import _env_html, _env_text, _default_context  # we render user-authored bodies
from premailer import transform as premailer_transform
from jinja2 import Template as JinjaTemplate
from models import EmailTemplate, EmailTemplateVersion, User

logger = get_logger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="marketing", pattern=r"^(marketing|transactional|system)$")
    subject: str = Field(min_length=1, max_length=500)
    preheader: Optional[str] = Field(default=None, max_length=500)
    body_html: str
    body_text: Optional[str] = None
    variables: list[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = Field(default=None, pattern=r"^(marketing|transactional|system)$")
    subject: Optional[str] = None
    preheader: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    variables: Optional[list[str]] = None
    is_active: Optional[bool] = None


class TemplatePreview(BaseModel):
    body_html: str
    subject: str
    preheader: Optional[str] = None
    context: dict = Field(default_factory=dict)


class TemplateSendTest(BaseModel):
    to_email: EmailStr
    context: dict = Field(default_factory=dict)


def _serialize(t: EmailTemplate) -> dict:
    return {
        "id": t.id,
        "slug": t.slug,
        "name": t.name,
        "category": t.category,
        "subject": t.subject,
        "preheader": t.preheader,
        "body_html": t.body_html,
        "body_text": t.body_text,
        "variables": t.variables or [],
        "current_version": t.current_version,
        "is_active": t.is_active,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


# ── Endpoints ────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    q = db.query(EmailTemplate)
    if category:
        q = q.filter(EmailTemplate.category == category)
    return [_serialize(t) for t in q.order_by(EmailTemplate.updated_at.desc()).all()]


@router.get("/templates/{template_id}")
async def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize(t)


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if db.query(EmailTemplate).filter(EmailTemplate.slug == payload.slug).first():
        raise HTTPException(status_code=400, detail="A template with this slug already exists")
    t = EmailTemplate(
        slug=payload.slug,
        name=payload.name,
        category=payload.category,
        subject=payload.subject,
        preheader=payload.preheader,
        body_html=payload.body_html,
        body_text=payload.body_text,
        variables=payload.variables,
        current_version=1,
        created_by=current_admin.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    # Snapshot version 1
    db.add(EmailTemplateVersion(
        template_id=t.id,
        version=1,
        subject=t.subject,
        preheader=t.preheader,
        body_html=t.body_html,
        body_text=t.body_text,
        saved_by=current_admin.id,
    ))
    db.commit()
    logger.info("Admin %s created template %s", current_admin.email, t.slug)
    return _serialize(t)


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    data = payload.model_dump(exclude_unset=True)
    # If any body / subject changed, snapshot a new version BEFORE applying.
    body_keys = {"subject", "preheader", "body_html", "body_text"}
    if body_keys & data.keys():
        t.current_version += 1
        db.add(EmailTemplateVersion(
            template_id=t.id,
            version=t.current_version,
            subject=data.get("subject", t.subject),
            preheader=data.get("preheader", t.preheader),
            body_html=data.get("body_html", t.body_html),
            body_text=data.get("body_text", t.body_text),
            saved_by=current_admin.id,
        ))

    for field, value in data.items():
        setattr(t, field, value)
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return _serialize(t)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"deleted": True}


@router.post("/templates/render-preview")
async def render_preview(
    payload: TemplatePreview,
    current_admin: User = Depends(get_current_admin),
):
    """Render a user-authored HTML body with a sample context — for the live preview pane.

    The body is treated as a Jinja2 template string (no file lookup). Context is
    merged with the same defaults the production renderer uses, so {{frontend_url}}
    etc. resolve correctly.
    """
    try:
        ctx = _default_context(payload.context or {})
        ctx.setdefault("subject", payload.subject)
        ctx.setdefault("preheader", payload.preheader)
        # Render the user-authored HTML through Jinja.
        rendered = _env_html.from_string(payload.body_html).render(**ctx)
        # CSS-inline.
        inlined = premailer_transform(rendered, keep_style_tags=False, disable_validation=True)
        return {"body_html": inlined, "subject": JinjaTemplate(payload.subject).render(**ctx)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Render error: {exc}")


@router.post("/templates/{template_id}/send-test")
async def send_test_email(
    template_id: int,
    payload: TemplateSendTest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Send a one-off test email of this template to a specified address.

    Renders the user-authored body inline (no file load) and enqueues via the
    standard ComplianceMailer pipeline.
    """
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    ctx = _default_context(payload.context or {})
    ctx.setdefault("subject", t.subject)
    rendered_subject = JinjaTemplate(t.subject).render(**ctx)
    rendered_html = _env_html.from_string(t.body_html).render(**ctx)
    rendered_text = _env_text.from_string(t.body_text or "").render(**ctx) if t.body_text else ""
    inlined_html = premailer_transform(rendered_html, keep_style_tags=False, disable_validation=True)

    from marketing.mailer import ComplianceMailer

    mailer = ComplianceMailer(db)
    row = mailer.queue(
        to_email=str(payload.to_email),
        subject=f"[TEST] {rendered_subject}",
        body_html=inlined_html,
        body_text=rendered_text,
        category="transactional",  # Skip marketing suppression — it's a test
        context={"template_id": t.id, "is_test": True},
    )
    return {
        "queued": row is not None and row.status in ("pending", "sending", "sent"),
        "outbox_id": row.id if row else None,
        "status": row.status if row else "unknown",
    }
