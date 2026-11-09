"""The no-account spaces: "Follow my request" and "My sponsorships".

Mounted under /api/sponsorship/portal. The one-time codes are the proposal
portal's (proposal_otp: hashed, ten minutes, single use, five attempts, rate
limited per address and per IP), but the token is a separate type, so a code
asked for here opens nothing else.

The rules of the proposal portal hold here too:
  * the address in the token is the only identity, and every query filters on it;
  * a case or sponsorship belonging to someone else answers 404, never 403;
  * responses come from audience-specific serializers (applicant_view,
    sponsor_view), so staff notes and other people's data cannot leak.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

import log_events as ev
import proposal_otp
import sponsorship_emails as emails
import sponsorship_files as files_svc
import sponsorship_service as svc
from auth_utils import (
    PORTAL_TOKEN_MINUTES, create_sponsorship_portal_token, get_sponsorship_portal_actor,
    get_sponsorship_portal_email,
)
from database import get_db
from http_headers import content_disposition
from logging_config import get_logger, mask_email
from models import Donation, Sponsorship, SponsorshipCase, SponsorshipCaseDocument
from routers.project_proposals import client_ip
from sponsorship_schemas import (
    CodeRequest, CodeVerification, FamilyApplication, OrphanApplication, SponsorCancel,
)

logger = get_logger(__name__)
router = APIRouter()

# A sponsorship the sponsor has something to see in: not a checkout they
# opened and walked away from.
VISIBLE_SPONSORSHIP_STATUSES = (svc.SP_ACTIVE, svc.SP_PAST_DUE, svc.SP_CANCELED, svc.SP_ENDED)


def _cases_for(db: Session, email: str) -> list[SponsorshipCase]:
    return (
        db.query(SponsorshipCase)
        .filter(func.lower(SponsorshipCase.submitter_email) == email.strip().lower())
        .order_by(SponsorshipCase.submitted_at.desc())
        .all()
    )


def _sponsorships_for(db: Session, email: str) -> list[Sponsorship]:
    return (
        db.query(Sponsorship)
        .filter(func.lower(Sponsorship.sponsor_email) == email.strip().lower(),
                Sponsorship.status.in_(VISIBLE_SPONSORSHIP_STATUSES))
        .order_by(Sponsorship.created_at.desc())
        .all()
    )


def _own_case(db: Session, case_id: int, email: str) -> SponsorshipCase:
    case = (
        db.query(SponsorshipCase)
        .filter(SponsorshipCase.id == case_id,
                func.lower(SponsorshipCase.submitter_email) == email.strip().lower())
        .first()
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return case


def _own_sponsorship(db: Session, sponsorship_id: int, email: str) -> Sponsorship:
    sp = (
        db.query(Sponsorship)
        .filter(Sponsorship.id == sponsorship_id,
                func.lower(Sponsorship.sponsor_email) == email.strip().lower(),
                Sponsorship.status.in_(VISIBLE_SPONSORSHIP_STATUSES))
        .first()
    )
    if sp is None:
        raise HTTPException(status_code=404, detail="Sponsorship not found")
    return sp


# ── Sign-in ───────────────────────────────────────────────────────────

@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
async def request_code(payload: CodeRequest, request: Request, db: Session = Depends(get_db)):
    """Email a code to an address that has something to show.

    Truthful about whether the address has a request or a sponsorship, for the
    reason recorded in the proposal portal: the honest person who mistyped
    their address is the common case, and a code that never comes is the
    worse failure for them.
    """
    email = payload.email.strip()
    has = _cases_for(db, email) if payload.audience == "applicant" else _sponsorships_for(db, email)
    if not has:
        raise HTTPException(
            status_code=404,
            detail="We have no request filed under this address." if payload.audience == "applicant"
            else "We have no sponsorship under this address.",
        )
    code = proposal_otp.issue_code(db, email=email, ip=client_ip(request))
    if code is None:
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in codes requested. Please wait and try again; this usually clears "
                   "within 15 minutes.")
    emails.access_code(email=email, code=code, ttl_minutes=proposal_otp.CODE_TTL_MINUTES, lang=payload.lang)
    return {"sent": True}


@router.post("/verify-code")
async def verify_code(payload: CodeVerification, db: Session = Depends(get_db)):
    if not proposal_otp.verify_code(db, email=payload.email, code=payload.code):
        raise HTTPException(status_code=401, detail="That code is not valid. Request a new one and try again.")
    logger.event(ev.SPONSORSHIP_PORTAL_SIGNED_IN, "signed in to the sponsorship space",
                 email=mask_email(payload.email))
    return {"token": create_sponsorship_portal_token(payload.email.strip()),
            "expires_in": PORTAL_TOKEN_MINUTES * 60}


# ── Applicant: follow my request ──────────────────────────────────────

@router.get("/requests")
async def my_requests(email: str = Depends(get_sponsorship_portal_email), db: Session = Depends(get_db)):
    """Every request filed from this address, with its timeline.

    `unread` counts what changed since the last visit; the visit itself then
    marks everything seen.
    """
    cases = _cases_for(db, email)
    cov = svc.coverage_map(db, cases)
    fin = svc.finances_map(db, [c.id for c in cases])
    items = [svc.applicant_view(db, c, cov[c.id], fin[c.id]) for c in cases]
    now = datetime.utcnow()
    for c in cases:
        c.applicant_seen_at = now
    db.commit()
    return {"email": email, "items": items}


@router.put("/requests/{case_id}")
async def resubmit_request(
    case_id: int,
    body: dict,
    email: str = Depends(get_sponsorship_portal_email),
    acting_staff: Optional[str] = Depends(get_sponsorship_portal_actor),
    db: Session = Depends(get_db),
):
    """Answer an information request with a corrected, complete form."""
    case = _own_case(db, case_id, email)
    schema = FamilyApplication if case.kind == svc.FAMILY else OrphanApplication
    try:
        data = schema.model_validate({**body, "email": case.submitter_email})
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json(include_url=False)))
    try:
        svc.resubmit(db, case, data.model_dump(), svc.Actor.applicant(email, acting_staff))
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    cov = svc.coverage_map(db, [case])[case.id]
    fin = svc.finances_map(db, [case.id])[case.id]
    return svc.applicant_view(db, case, cov, fin)


@router.post("/requests/{case_id}/documents", status_code=status.HTTP_201_CREATED)
async def add_documents(
    case_id: int,
    files: list[UploadFile] = File(default_factory=list),
    doc_types: list[str] = Form(default_factory=list),
    email: str = Depends(get_sponsorship_portal_email),
    acting_staff: Optional[str] = Depends(get_sponsorship_portal_actor),
    db: Session = Depends(get_db),
):
    case = _own_case(db, case_id, email)
    if case.status not in svc.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="This request is closed to new documents.")
    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one file.")
    # The cap is per submission, not per case lifetime: a case lives for
    # years and gets a new school certificate every September.
    staged = await files_svc.stage_documents(files, doc_types)
    stored = await files_svc.store_documents(
        db, case, staged, uploaded_by="applicant", email=email,
        actor=svc.Actor.applicant(email, acting_staff))
    cov = svc.coverage_map(db, [case])[case.id]
    fin = svc.finances_map(db, [case.id])[case.id]
    return {"stored": stored, "offered": len(staged), "request": svc.applicant_view(db, case, cov, fin)}


@router.get("/requests/{case_id}/documents/{doc_id}")
async def download_own_document(
    case_id: int, doc_id: int,
    email: str = Depends(get_sponsorship_portal_email),
    db: Session = Depends(get_db),
):
    case = _own_case(db, case_id, email)
    doc = db.query(SponsorshipCaseDocument).filter(
        SponsorshipCaseDocument.id == doc_id, SponsorshipCaseDocument.case_id == case.id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return files_svc.stream_object(doc.object_key, doc.content_type, doc.filename)


# ── Sponsor: my sponsorships ──────────────────────────────────────────

@router.get("/sponsorships")
async def my_sponsorships(email: str = Depends(get_sponsorship_portal_email), db: Session = Depends(get_db)):
    items = [svc.sponsor_view(db, sp, photo_url_for=files_svc.photo_url_for)
             for sp in _sponsorships_for(db, email)]
    return {"email": email, "items": items}


@router.post("/sponsorships/{sponsorship_id}/cancel")
async def cancel_my_sponsorship(
    sponsorship_id: int,
    payload: SponsorCancel,
    email: str = Depends(get_sponsorship_portal_email),
    db: Session = Depends(get_db),
):
    """Stop future charges. Stripe first: if it refuses, nothing changes here,
    so the page never claims a sponsorship stopped while the card is still
    being charged."""
    sp = _own_sponsorship(db, sponsorship_id, email)
    if sp.status not in svc.COMMITTED_STATUSES:
        raise HTTPException(status_code=409, detail="This sponsorship is not running.")
    cancel_in_stripe(sp)
    svc.end_by_sponsor(db, sp, reason=payload.reason, note=payload.note)
    return svc.sponsor_view(db, sp, photo_url_for=files_svc.photo_url_for)


@router.get("/sponsorships/{sponsorship_id}/receipts/{donation_id}")
async def receipt(
    sponsorship_id: int, donation_id: int,
    email: str = Depends(get_sponsorship_portal_email),
    db: Session = Depends(get_db),
):
    sp = _own_sponsorship(db, sponsorship_id, email)
    donation = db.query(Donation).filter(Donation.id == donation_id, Donation.sponsorship_id == sp.id).first()
    if donation is None:
        raise HTTPException(status_code=404, detail="Receipt not found")
    from pdf_service import generate_donation_certificate_to_bytes
    pdf = generate_donation_certificate_to_bytes(
        donor_name=donation.name, amount=donation.amount,
        donation_date=donation.donated_at or datetime.utcnow(), donation_id=donation.id)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={
        "Content-Disposition": content_disposition("MyZakat_Receipt_%d.pdf" % donation.id)})


def cancel_in_stripe(sp: Sponsorship) -> None:
    """Cancel the Stripe subscription behind a sponsorship, or raise 502.

    A subscription Stripe no longer knows is already cancelled — that is
    success, not an error.
    """
    if not sp.stripe_subscription_id:
        return
    try:
        stripe.Subscription.cancel(sp.stripe_subscription_id)
    except stripe.error.InvalidRequestError as exc:
        if "No such subscription" in str(exc) or "canceled" in str(exc).lower():
            return
        logger.event(ev.SPONSORSHIP_ENDED, "Stripe refused to cancel a sponsorship",
                     level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                     reason=ev.REASON_STRIPE_ERROR, sponsorship_id=sp.id)
        raise HTTPException(status_code=502, detail="We could not stop the payments just now. Please try again.")
    except stripe.error.StripeError as exc:
        logger.event(ev.SPONSORSHIP_ENDED, "Stripe refused to cancel a sponsorship",
                     level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                     reason=ev.REASON_STRIPE_ERROR, sponsorship_id=sp.id)
        raise HTTPException(status_code=502, detail="We could not stop the payments just now. Please try again.")
