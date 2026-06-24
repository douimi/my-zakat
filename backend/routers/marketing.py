"""Marketing router — public unsubscribe, Resend webhooks, admin outbox/suppressions.

Public (no auth):
  - GET  /api/marketing/unsubscribe?token=...     → confirmation page payload
  - POST /api/marketing/unsubscribe                → one-click RFC 8058 endpoint
  - POST /api/marketing/webhooks/resend           → bounce / complaint / delivered events

Admin (requires admin):
  - GET    /api/marketing/outbox                  → list recent emails
  - GET    /api/marketing/suppressions            → list suppressions
  - POST   /api/marketing/suppressions            → add a suppression
  - DELETE /api/marketing/suppressions/{email}    → remove a suppression
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from logging_config import get_logger
from marketing.compliance import (
    consume_unsubscribe_token,
    is_suppressed,
    log_consent,
    suppress_email,
    unsuppress_email,
)
from models import CampaignSend, EmailEvent, EmailOutbox, EmailSuppression, MarketingCampaign, User

logger = get_logger(__name__)

router = APIRouter()

RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "")


# ─────────────────────────────────────────────────────────────────────
# Public unsubscribe endpoints
# ─────────────────────────────────────────────────────────────────────

class UnsubscribeRequest(BaseModel):
    token: str


@router.get("/unsubscribe")
async def unsubscribe_get(token: str, request: Request, db: Session = Depends(get_db)):
    """Browser-clicked unsubscribe link.

    Returns the email + status so the frontend can show a confirmation page.
    """
    row = consume_unsubscribe_token(db, token, used_ip=_client_ip(request))
    if not row:
        raise HTTPException(status_code=404, detail="Invalid or expired unsubscribe link")

    # Idempotent: suppress + log consent regardless of whether already used.
    suppress_email(db, row.email, reason="unsubscribe", scope=row.scope, source_message_id="unsubscribe-link")
    log_consent(
        db,
        row.email,
        action="opt_out",
        source="unsubscribe_link",
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        consent_text=f"User clicked unsubscribe link (scope={row.scope})",
    )
    return {
        "email": row.email,
        "scope": row.scope,
        "unsubscribed": True,
        "message": "You have been unsubscribed. You will not receive further marketing emails from MyZakat.",
    }


@router.post("/unsubscribe")
async def unsubscribe_post(
    payload: UnsubscribeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """RFC 8058 one-click unsubscribe — called by mail clients without user interaction."""
    return await unsubscribe_get(payload.token, request, db)


# ─────────────────────────────────────────────────────────────────────
# Resend webhook (bounces / complaints / delivered / opened)
# ─────────────────────────────────────────────────────────────────────

@router.post("/webhooks/resend")
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    """Receive event notifications from Resend.

    Resend signs requests using Svix. We verify the signature using
    RESEND_WEBHOOK_SECRET (set in the Resend dashboard).

    Event types we care about for P1:
      - email.bounced       → suppress permanently
      - email.complained    → suppress permanently
      - email.delivery_delayed → log only, do not suppress
      - email.delivered     → mark outbox row as delivered (idempotent)
    """
    raw_body = await request.body()

    # Verify Svix signature if we have a secret configured.
    if RESEND_WEBHOOK_SECRET:
        try:
            from svix.webhooks import Webhook, WebhookVerificationError  # noqa: WPS433

            headers = {
                "svix-id": request.headers.get("svix-id", ""),
                "svix-timestamp": request.headers.get("svix-timestamp", ""),
                "svix-signature": request.headers.get("svix-signature", ""),
            }
            wh = Webhook(RESEND_WEBHOOK_SECRET)
            wh.verify(raw_body, headers)
        except Exception as exc:
            logger.warning("Resend webhook signature verification failed: %s", exc)
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        import json

        event = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed JSON body")

    event_type = event.get("type", "")
    data = event.get("data", {}) or {}
    to_field = data.get("to") or []
    recipient = to_field[0] if to_field else data.get("email", "")
    message_id = data.get("email_id") or data.get("id")

    logger.info("Resend webhook: type=%s recipient=%s msg=%s", event_type, recipient, message_id)

    if not recipient:
        return {"received": True, "action": "no-op (no recipient)"}

    # Find the associated campaign_send via outbox.provider_message_id so we
    # can update aggregate counters and insert an event row.
    outbox_row = None
    cs_row: CampaignSend | None = None
    if message_id:
        outbox_row = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.provider_message_id == message_id)
            .first()
        )
        if outbox_row:
            cs_row = (
                db.query(CampaignSend)
                .filter(CampaignSend.outbox_id == outbox_row.id)
                .first()
            )

    def _log_event(etype: str, *, url_value: str | None = None, meta: dict | None = None) -> None:
        ev = EmailEvent(
            campaign_send_id=cs_row.id if cs_row else None,
            outbox_id=outbox_row.id if outbox_row else None,
            recipient_email=recipient.lower(),
            campaign_id=cs_row.campaign_id if cs_row else None,
            event_type=etype,
            url=url_value,
            event_metadata=meta or {},
        )
        db.add(ev)

    if event_type in ("email.bounced", "bounced"):
        bounce_type = (data.get("bounce", {}) or {}).get("type", "")
        is_hard = "hard" in bounce_type.lower() or "permanent" in bounce_type.lower() or not bounce_type
        if is_hard:
            suppress_email(db, recipient, reason="hard_bounce", source_message_id=message_id)
        _log_event("bounce", meta={"bounce_type": bounce_type, "is_hard": is_hard})
        if cs_row and is_hard and not cs_row.bounced:
            cs_row.bounced = True
            if cs_row.campaign_id:
                camp = db.query(MarketingCampaign).filter(MarketingCampaign.id == cs_row.campaign_id).first()
                if camp:
                    camp.bounced_count = (camp.bounced_count or 0) + 1
        db.commit()

    elif event_type in ("email.complained", "complained"):
        suppress_email(db, recipient, reason="complaint", source_message_id=message_id)
        _log_event("complaint", meta={})
        if cs_row and not cs_row.complained:
            cs_row.complained = True
            if cs_row.campaign_id:
                camp = db.query(MarketingCampaign).filter(MarketingCampaign.id == cs_row.campaign_id).first()
                if camp:
                    camp.complained_count = (camp.complained_count or 0) + 1
        db.commit()

    elif event_type in ("email.delivered", "delivered"):
        if outbox_row and outbox_row.status != "sent":
            outbox_row.status = "sent"
            outbox_row.sent_at = outbox_row.sent_at or datetime.utcnow()
        _log_event("delivered", meta={})
        if cs_row and cs_row.status != "sent":
            cs_row.status = "sent"
            if cs_row.campaign_id:
                camp = db.query(MarketingCampaign).filter(MarketingCampaign.id == cs_row.campaign_id).first()
                if camp:
                    camp.delivered_count = (camp.delivered_count or 0) + 1
        db.commit()

    return {"received": True, "event_type": event_type, "recipient": recipient}


# ─────────────────────────────────────────────────────────────────────
# Admin endpoints
# ─────────────────────────────────────────────────────────────────────

@router.get("/outbox")
async def list_outbox(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Paginated view of recent emails. Admin only."""
    query = db.query(EmailOutbox)
    if status_filter:
        query = query.filter(EmailOutbox.status == status_filter)
    query = query.order_by(EmailOutbox.created_at.desc())
    total = query.count()
    rows = query.offset(skip).limit(min(limit, 200)).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "category": r.category,
                "template_slug": r.template_slug,
                "to_email": r.to_email,
                "to_name": r.to_name,
                "subject": r.subject,
                "status": r.status,
                "attempts": r.attempts,
                "provider_message_id": r.provider_message_id,
                "error": r.error,
                "created_at": r.created_at,
                "sent_at": r.sent_at,
            }
            for r in rows
        ],
    }


@router.get("/outbox/{outbox_id}")
async def get_outbox_item(
    outbox_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    row = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Outbox row not found")
    return {
        "id": row.id,
        "category": row.category,
        "template_slug": row.template_slug,
        "to_email": row.to_email,
        "to_name": row.to_name,
        "from_email": row.from_email,
        "from_name": row.from_name,
        "subject": row.subject,
        "body_html": row.body_html,
        "body_text": row.body_text,
        "status": row.status,
        "attempts": row.attempts,
        "provider_message_id": row.provider_message_id,
        "error": row.error,
        "created_at": row.created_at,
        "sent_at": row.sent_at,
    }


class SuppressionCreate(BaseModel):
    email: EmailStr
    scope: str = Field(default="all", pattern="^(all|marketing|transactional|system)$")
    reason: str = Field(default="manual", max_length=50)
    note: Optional[str] = Field(default=None, max_length=1000)


@router.get("/suppressions")
async def list_suppressions(
    skip: int = 0,
    limit: int = 100,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    query = db.query(EmailSuppression)
    if q:
        query = query.filter(EmailSuppression.email.ilike(f"%{q.lower()}%"))
    query = query.order_by(EmailSuppression.created_at.desc())
    total = query.count()
    rows = query.offset(skip).limit(min(limit, 500)).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "email": r.email,
                "scope": r.scope,
                "reason": r.reason,
                "source_message_id": r.source_message_id,
                "note": r.note,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.post("/suppressions", status_code=status.HTTP_201_CREATED)
async def create_suppression(
    payload: SuppressionCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    row = suppress_email(
        db,
        payload.email,
        reason=payload.reason,
        scope=payload.scope,
        note=payload.note,
    )
    return {
        "id": row.id,
        "email": row.email,
        "scope": row.scope,
        "reason": row.reason,
        "note": row.note,
        "created_at": row.created_at,
    }


@router.delete("/suppressions/{email}")
async def delete_suppression(
    email: str,
    scope: str = "all",
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    removed = unsuppress_email(db, email, scope=scope)
    if not removed:
        raise HTTPException(status_code=404, detail="Suppression not found")
    return {"removed": True, "email": email.lower(), "scope": scope}


@router.get("/check/{email}")
async def check_email_status(
    email: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Quick lookup — is this address suppressed?"""
    return {
        "email": email.lower(),
        "suppressed_all": is_suppressed(db, email, scope="all"),
        "suppressed_marketing": is_suppressed(db, email, scope="marketing"),
        "suppressed_transactional": is_suppressed(db, email, scope="transactional"),
    }


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""
