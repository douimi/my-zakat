import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database import get_db
from models import Subscription
from schemas import SubscriptionCreate, SubscriptionResponse, SmsOptInRequest, SmsOptInResponse
from auth_utils import get_current_admin
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


class NewsletterRequest(BaseModel):
    subject: str
    body: str


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _normalize_us_phone(raw: str) -> str:
    """Return phone in E.164 format (+1XXXXXXXXXX) for US numbers, or '' if invalid.

    Accepts common formats: (833) 699-2528, 833-699-2528, 8336992528,
    +1 833 699 2528, etc.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return ""


def _client_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For from Traefik."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


def _mask_phone(e164: str) -> str:
    """Mask a phone like +18336992528 -> +1•••••92528 for the response."""
    if len(e164) < 6:
        return e164
    return e164[:2] + "•" * (len(e164) - 6) + e164[-4:]


@router.post("/sms-opt-in", response_model=SmsOptInResponse)
async def sms_opt_in(
    payload: SmsOptInRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Public SMS Subscription endpoint used by the /sms-opt-in page.

    Per 10DLC / TCR: the SMS consent checkbox must be optional and the form
    must submit successfully whether or not the user ticks it. This endpoint
    honours that:

      - consent=True  → creates or refreshes an SMS-enabled subscription
                        and records the exact disclosure wording, timestamp,
                        and source IP for proof-of-consent audits.
      - consent=False → returns success without creating any subscription
                        and without ever recording a consent trail. The user
                        gave us information, but they made no opt-in choice
                        so we do nothing with it.

    Phone is still validated on the consent=True path so we don't store
    junk. On the no-consent path phone is left untouched.

    Idempotent on the phone number — re-submitting with consent refreshes
    the consent record rather than erroring out.
    """
    # No consent → not an opt-in. Return a success response so the form
    # completes, but do not create or update any subscription. We never
    # record a consent trail we don't have.
    if not payload.consent:
        logger.info("SMS Subscription form submitted without consent — no record created")
        return SmsOptInResponse(
            success=True,
            message=(
                "Thanks for stopping by. You haven't opted in to text messages, so "
                "you won't receive any SMS from MyZakat. Come back any time if you "
                "change your mind."
            ),
            masked_phone="",
        )

    phone_e164 = _normalize_us_phone(payload.phone)
    if not phone_e164:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid US mobile number (10 digits).",
        )

    now = datetime.utcnow()
    ip = _client_ip(request)

    # Upsert on phone — refresh consent if the same number opts in again.
    existing = db.query(Subscription).filter(Subscription.phone == phone_e164).first()
    if existing:
        existing.name = payload.name
        if payload.email:
            existing.email = payload.email
        existing.wants_sms = True
        existing.sms_consent_at = now
        existing.sms_consent_ip = ip
        existing.sms_consent_text = payload.agreed_to_text
        db.commit()
        db.refresh(existing)
        logger.info("SMS re-opt-in for %s from %s", _mask_phone(phone_e164), ip)
        return SmsOptInResponse(
            success=True,
            message="You're already subscribed — your consent has been refreshed.",
            masked_phone=_mask_phone(phone_e164),
        )

    # New subscriber. Email is required by the model (NOT NULL), so synthesize a
    # placeholder if the user didn't provide one — this keeps the SMS-only flow
    # working without breaking existing email-subscriber assumptions.
    email = payload.email or f"sms+{phone_e164.lstrip('+')}@no-email.myzakat.org"

    new_sub = Subscription(
        name=payload.name.strip(),
        email=email,
        phone=phone_e164,
        wants_email=bool(payload.email),
        wants_sms=True,
        subscribed_at=now,
        sms_consent_at=now,
        sms_consent_ip=ip,
        sms_consent_text=payload.agreed_to_text,
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)

    logger.info("New SMS opt-in for %s from %s", _mask_phone(phone_e164), ip)
    return SmsOptInResponse(
        success=True,
        message=(
            "Thanks! You've opted in to receive text messages from MyZakat. "
            "Reply STOP at any time to unsubscribe."
        ),
        masked_phone=_mask_phone(phone_e164),
    )


@router.post("/", response_model=SubscriptionResponse)
async def create_subscription(subscription: SubscriptionCreate, db: Session = Depends(get_db)):
    # Check if email already exists
    existing = db.query(Subscription).filter(Subscription.email == subscription.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already subscribed")
    
    db_subscription = Subscription(**subscription.dict())
    db.add(db_subscription)
    db.commit()
    db.refresh(db_subscription)
    return db_subscription


@router.get("/", response_model=List[SubscriptionResponse])
async def get_subscriptions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    subscriptions = db.query(Subscription).offset(skip).limit(limit).all()
    return subscriptions


@router.delete("/{subscription_id}")
async def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    db.delete(subscription)
    db.commit()
    return {"message": "Subscription deleted"}


@router.post("/send-newsletter")
async def send_newsletter(
    newsletter: NewsletterRequest,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Get all email subscribers
    subscribers = db.query(Subscription).filter(Subscription.wants_email == True).all()
    
    if not subscribers:
        raise HTTPException(status_code=400, detail="No email subscribers found")
    
    # For now, we'll just return success. In a real implementation, 
    # you would integrate with an email service like SendGrid, AWS SES, etc.
    email_count = len(subscribers)
    
    # TODO: Implement actual email sending logic here
    # This is a placeholder that simulates sending emails
    
    return {
        "message": f"Newsletter sent to {email_count} subscribers",
        "sent_count": email_count,
        "subject": newsletter.subject
    }
