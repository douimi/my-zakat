"""Marketing campaign CRUD + send-now (admin only).

A campaign is the broadcast container: it ties a template to a segment and
records the per-recipient send fan-out. The actual delivery still uses the
P1 ComplianceMailer pipeline — each campaign send becomes one EmailOutbox
row — so all suppression / unsubscribe / Resend webhooks already work for
campaigns automatically.
"""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from logging_config import get_logger
from marketing.audience import iter_segment_recipients
from marketing.mailer import ComplianceMailer
from marketing.renderer import _default_context, _env_html, _env_text
from premailer import transform as premailer_transform
from jinja2 import Template as JinjaTemplate
from models import (
    AudienceSegment,
    CampaignSend,
    EmailTemplate,
    MarketingCampaign,
    User,
)

logger = get_logger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    template_id: Optional[int] = None
    segment_id: Optional[int] = None
    subject_override: Optional[str] = None
    preheader_override: Optional[str] = None
    body_html_override: Optional[str] = None
    body_text_override: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    template_id: Optional[int] = None
    segment_id: Optional[int] = None
    subject_override: Optional[str] = None
    preheader_override: Optional[str] = None
    body_html_override: Optional[str] = None
    body_text_override: Optional[str] = None


def _serialize(c: MarketingCampaign) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "template_id": c.template_id,
        "segment_id": c.segment_id,
        "subject_override": c.subject_override,
        "preheader_override": c.preheader_override,
        "body_html_override": c.body_html_override,
        "body_text_override": c.body_text_override,
        "status": c.status,
        "scheduled_at": c.scheduled_at,
        "started_at": c.started_at,
        "completed_at": c.completed_at,
        "total_recipients": c.total_recipients,
        "queued_count": c.queued_count,
        "sent_count": c.sent_count,
        "failed_count": c.failed_count,
        "suppressed_count": c.suppressed_count,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


# ── CRUD ─────────────────────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    q = db.query(MarketingCampaign)
    if status_filter:
        q = q.filter(MarketingCampaign.status == status_filter)
    return [_serialize(c) for c in q.order_by(MarketingCampaign.created_at.desc()).all()]


@router.get("/campaigns/{campaign_id}")
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize(c)


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    c = MarketingCampaign(
        name=payload.name,
        template_id=payload.template_id,
        segment_id=payload.segment_id,
        subject_override=payload.subject_override,
        preheader_override=payload.preheader_override,
        body_html_override=payload.body_html_override,
        body_text_override=payload.body_text_override,
        status="draft",
        created_by=current_admin.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize(c)


@router.put("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c.status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a campaign in '{c.status}' state")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return _serialize(c)


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c.status == "sending":
        raise HTTPException(status_code=400, detail="Cannot delete a campaign that is currently sending")
    db.delete(c)
    db.commit()
    return {"deleted": True}


# ── Send-now ─────────────────────────────────────────────────────────

@router.post("/campaigns/{campaign_id}/send-now")
async def send_campaign_now(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Materialize per-recipient sends from the segment + enqueue all via ComplianceMailer.

    Idempotent on `dispatch_token` — calling twice in a row won't double-send.
    """
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c.status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Campaign is in '{c.status}' state and cannot be re-sent")
    if not c.template_id and not c.body_html_override:
        raise HTTPException(status_code=400, detail="Campaign needs a template or a body override")
    if not c.segment_id:
        raise HTTPException(status_code=400, detail="Campaign needs a target segment")

    template = db.query(EmailTemplate).filter(EmailTemplate.id == c.template_id).first() if c.template_id else None
    segment = db.query(AudienceSegment).filter(AudienceSegment.id == c.segment_id).first()
    if not segment:
        raise HTTPException(status_code=400, detail="Target segment no longer exists")

    # Resolve final subject / body / text — overrides win over template.
    subject_tpl = c.subject_override or (template.subject if template else "")
    preheader_tpl = c.preheader_override or (template.preheader if template else None)
    body_html_tpl = c.body_html_override or (template.body_html if template else "")
    body_text_tpl = c.body_text_override or (template.body_text if template else "")

    if not subject_tpl.strip() or not body_html_tpl.strip():
        raise HTTPException(status_code=400, detail="Subject and HTML body are required")

    # Idempotency token — stable across re-tries.
    if not c.dispatch_token:
        c.dispatch_token = secrets.token_urlsafe(32)
    c.status = "sending"
    c.started_at = datetime.utcnow()
    db.commit()

    mailer = ComplianceMailer(db)
    total = 0
    queued = 0
    suppressed = 0

    try:
        for recipient in iter_segment_recipients(db, segment.definition or [], batch_size=500):
            total += 1
            email = recipient["email"]

            # Skip if we already queued this (email, campaign) combo — idempotency at the row level.
            existing = (
                db.query(CampaignSend)
                .filter(CampaignSend.campaign_id == c.id, CampaignSend.recipient_email == email)
                .first()
            )
            if existing and existing.status not in ("pending",):
                continue

            # Build a per-recipient context. Variable interpolation in subject + body.
            ctx = _default_context({
                "first_name": (recipient.get("name") or "").split(" ")[0] if recipient.get("name") else "",
                "name": recipient.get("name") or "",
                "email": email,
            })
            ctx.setdefault("subject", subject_tpl)
            try:
                rendered_subject = JinjaTemplate(subject_tpl).render(**ctx)
                rendered_html = _env_html.from_string(body_html_tpl).render(**ctx)
                rendered_text = _env_text.from_string(body_text_tpl or "").render(**ctx) if body_text_tpl else ""
            except Exception as exc:
                logger.warning("Render error for campaign %s recipient %s: %s", c.id, email, exc)
                cs = existing or CampaignSend(campaign_id=c.id, recipient_email=email, recipient_name=recipient.get("name"))
                cs.status = "failed"
                cs.error = f"Render error: {exc}"
                if not existing:
                    db.add(cs)
                db.commit()
                continue
            inlined_html = premailer_transform(rendered_html, keep_style_tags=False, disable_validation=True)

            outbox = mailer.queue(
                to_email=email,
                to_name=recipient.get("name"),
                subject=rendered_subject,
                body_html=inlined_html,
                body_text=rendered_text,
                category="marketing",
                context={"campaign_id": c.id, "first_name": ctx.get("first_name")},
                idempotency_key=f"campaign-{c.id}-{email}-{c.dispatch_token[:16]}",
            )

            cs = existing or CampaignSend(
                campaign_id=c.id,
                recipient_email=email,
                recipient_name=recipient.get("name"),
            )
            cs.outbox_id = outbox.id if outbox else None
            cs.status = "suppressed" if (outbox and outbox.status == "suppressed") else ("queued" if outbox else "failed")
            cs.error = outbox.error if (outbox and outbox.error) else None
            if not existing:
                db.add(cs)
            db.commit()

            if cs.status == "suppressed":
                suppressed += 1
            elif cs.status == "queued":
                queued += 1

        c.total_recipients = total
        c.queued_count = queued
        c.suppressed_count = suppressed
        c.completed_at = datetime.utcnow()
        # Mark as 'sent' optimistically — individual delivery statuses live on
        # campaign_sends / email_outbox, so 'sent' here means "fan-out complete".
        c.status = "sent" if queued > 0 or total == 0 else "failed"
        db.commit()

    except Exception as exc:
        c.status = "failed"
        db.commit()
        logger.exception("Campaign %s send-now failed", c.id)
        raise HTTPException(status_code=500, detail=f"Campaign send failed: {exc}")

    logger.info(
        "Campaign %s send-now: total=%s queued=%s suppressed=%s",
        c.id, total, queued, suppressed,
    )
    return {
        "campaign_id": c.id,
        "status": c.status,
        "total_recipients": total,
        "queued": queued,
        "suppressed": suppressed,
    }


# Per-recipient status drilldown.
@router.get("/campaigns/{campaign_id}/sends")
async def list_campaign_sends(
    campaign_id: int,
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    q = db.query(CampaignSend).filter(CampaignSend.campaign_id == campaign_id)
    if status_filter:
        q = q.filter(CampaignSend.status == status_filter)
    total = q.count()
    rows = q.order_by(CampaignSend.id.desc()).offset(skip).limit(min(limit, 500)).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "recipient_email": r.recipient_email,
                "recipient_name": r.recipient_name,
                "outbox_id": r.outbox_id,
                "status": r.status,
                "error": r.error,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }
