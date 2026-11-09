"""Public half of sponsorship: browse, read a profile, sponsor, apply.

Mounted under /api/sponsorship. No authentication. Everything returned here is
built by sponsorship_service.public_card / public_detail, which write the public
fields one by one — a private field can only reach this router by being added
there on purpose.

Only `published` cases exist as far as this router is concerned: a paused,
closed or not-yet-approved case answers 404 exactly like one that never existed.
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

import log_events as ev
import sponsorship_emails as emails
import sponsorship_files as files_svc
import sponsorship_service as svc
from database import get_db
from logging_config import get_logger, mask_email
from models import (
    Sponsorship, SponsorshipCase, SponsorshipDisbursement, SponsorshipFamilyDetails,
    SponsorshipOrphanDetails,
)
from routers.project_proposals import client_ip
from sponsorship_schemas import CheckoutRequest, FamilyApplication, OrphanApplication

logger = get_logger(__name__)
router = APIRouter()

# A form a family fills once is not something one address files ten times an
# hour. Counted from the table itself, like the proposal portal's code limits.
MAX_APPLICATIONS_PER_IP_PER_HOUR = 10


def _published(db: Session, ref: str) -> SponsorshipCase:
    case = (
        db.query(SponsorshipCase)
        .filter(SponsorshipCase.reference == (ref or "").strip().upper(),
                SponsorshipCase.status == svc.PUBLISHED)
        .first()
    )
    if case is None:
        raise HTTPException(status_code=404, detail="This profile is not available.")
    return case


def _details_map(db: Session, cases: list[SponsorshipCase]) -> dict:
    fam_ids = [c.id for c in cases if c.kind == svc.FAMILY]
    orph_ids = [c.id for c in cases if c.kind == svc.ORPHAN]
    out = {}
    if fam_ids:
        out.update({d.case_id: d for d in db.query(SponsorshipFamilyDetails)
                    .filter(SponsorshipFamilyDetails.case_id.in_(fam_ids)).all()})
    if orph_ids:
        out.update({d.case_id: d for d in db.query(SponsorshipOrphanDetails)
                    .filter(SponsorshipOrphanDetails.case_id.in_(orph_ids)).all()})
    return out


@router.get("/stats")
async def stats(db: Session = Depends(get_db)):
    """Live counts for the landing page. Aggregates only."""
    published = db.query(SponsorshipCase).filter(SponsorshipCase.status == svc.PUBLISHED).all()
    cov = svc.coverage_map(db, published)
    out = {}
    for kind in svc.KINDS:
        rows = [c for c in published if c.kind == kind]
        out[kind] = {
            "published": len(rows),
            "waiting": sum(1 for c in rows if cov[c.id]["state"] != "full"),
            "fully_sponsored": sum(1 for c in rows if cov[c.id]["state"] == "full"),
        }
    active = db.query(Sponsorship).filter(Sponsorship.status.in_(svc.COMMITTED_STATUSES)).all()
    out["active_sponsorships"] = len(active)
    out["distributed_cents"] = int(
        db.query(func.coalesce(func.sum(SponsorshipDisbursement.amount_cents), 0)).scalar() or 0)
    return out


@router.get("/cases")
async def list_cases(
    kind: Optional[Literal["family", "orphan"]] = None,
    country: Optional[str] = None,
    gender: Optional[Literal["male", "female"]] = None,
    age_min: Optional[int] = Query(None, ge=0, le=18),
    age_max: Optional[int] = Query(None, ge=0, le=18),
    needs_sponsor: bool = True,
    sort: Literal["waiting", "newest", "need"] = "waiting",
    limit: int = Query(24, ge=1, le=60),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Published profiles. Longest-waiting first by default: fairness to the
    people who have been listed longest is the platform's choice to make, not
    an accident of insertion order."""
    q = db.query(SponsorshipCase).filter(SponsorshipCase.status == svc.PUBLISHED)
    if kind:
        q = q.filter(SponsorshipCase.kind == kind)
    all_of_kind = q.all()
    countries = sorted({c.country for c in all_of_kind if c.country})
    if country:
        all_of_kind = [c for c in all_of_kind if c.country.lower() == country.lower()]
    details = _details_map(db, all_of_kind)
    rows = []
    for c in all_of_kind:
        d = details.get(c.id)
        if c.kind == svc.ORPHAN and d is not None:
            age = svc.age_on(d.birth_date)
            if gender and d.gender != gender:
                continue
            if age_min is not None and (age is None or age < age_min):
                continue
            if age_max is not None and (age is None or age > age_max):
                continue
        elif gender or age_min is not None or age_max is not None:
            # Age and gender describe a child; a family does not match them.
            if kind != svc.FAMILY:
                continue
        rows.append(c)
    cov = svc.coverage_map(db, rows)
    if needs_sponsor:
        rows = [c for c in rows if cov[c.id]["state"] != "full"]
    if sort == "waiting":
        rows.sort(key=lambda c: (c.published_at or datetime.max, c.id))
    elif sort == "newest":
        rows.sort(key=lambda c: (c.published_at or datetime.min), reverse=True)
    else:
        rows.sort(key=lambda c: cov[c.id]["remaining_cents"], reverse=True)
    total = len(rows)
    page = rows[offset:offset + limit]
    return {
        "total": total,
        "countries": countries,
        "items": [svc.public_card(c, details.get(c.id), cov[c.id], photo_url=files_svc.photo_url_for(c))
                  for c in page],
    }


def _related(db: Session, case: SponsorshipCase, details) -> list[dict]:
    """Published family / siblings / children of this case, public fields only."""
    ids: list[tuple[int, str]] = []
    if case.kind == svc.ORPHAN and details is not None and details.family_case_id:
        ids.append((details.family_case_id, "family"))
        for d in db.query(SponsorshipOrphanDetails).filter(
                SponsorshipOrphanDetails.family_case_id == details.family_case_id,
                SponsorshipOrphanDetails.case_id != case.id).all():
            ids.append((d.case_id, "sibling"))
    elif case.kind == svc.FAMILY:
        for d in db.query(SponsorshipOrphanDetails).filter(
                SponsorshipOrphanDetails.family_case_id == case.id).all():
            ids.append((d.case_id, "child"))
    if not ids:
        return []
    cases = {c.id: c for c in db.query(SponsorshipCase).filter(
        SponsorshipCase.id.in_([i for i, _ in ids]), SponsorshipCase.status == svc.PUBLISHED).all()}
    cov = svc.coverage_map(db, list(cases.values()))
    dmap = _details_map(db, list(cases.values()))
    out = []
    for cid, relation in ids:
        c = cases.get(cid)
        if c is None:
            continue
        out.append({"relation": relation,
                    **svc.public_card(c, dmap.get(cid), cov[cid], photo_url=files_svc.photo_url_for(c))})
    return out


@router.get("/cases/{ref}")
async def get_case(ref: str, db: Session = Depends(get_db)):
    case = _published(db, ref)
    details = svc.details_of(db, case)
    cov = svc.coverage_map(db, [case])[case.id]
    fin = svc.finances_map(db, [case.id])[case.id]
    return svc.public_detail(db, case, details, cov, photo_url=files_svc.photo_url_for(case),
                             finances=fin, related=_related(db, case, details))


@router.get("/cases/{ref}/photo")
async def case_photo(ref: str, db: Session = Depends(get_db)):
    case = _published(db, ref)
    if not case.public_photo_key:
        raise HTTPException(status_code=404, detail="No photo")
    return files_svc.stream_object(case.public_photo_key, "image/jpeg" if case.public_photo_key.endswith((".jpg", ".jpeg"))
                                   else "image/png" if case.public_photo_key.endswith(".png") else "image/webp",
                                   "%s.jpg" % case.reference)


@router.post("/cases/{ref}/checkout")
async def start_checkout(ref: str, payload: CheckoutRequest, db: Session = Depends(get_db)):
    """Open a Stripe subscription checkout for a monthly sponsorship.

    The amount is reserved (pending) for the life of the Stripe session, which
    is created with an explicit 31-minute expiry so the reservation cannot
    outlive it.
    """
    case = _published(db, ref)
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Payment processing is not configured. Please contact support.")
    try:
        sp = svc.open_checkout(db, case, email=payload.email, name=payload.name,
                               amount_cents=payload.monthly_amount_cents, lang=payload.lang)
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    frontend = os.getenv("FRONTEND_URL", "https://myzakat.org").rstrip("/")
    prefix = "/ar" if payload.lang == "ar" else ""
    purpose = "Sponsorship %s" % case.reference
    metadata = {
        "type": "sponsorship",
        "sponsorship_id": str(sp.id),
        "case_reference": case.reference,
        # Read by the generic subscription handler in donations.py, which
        # files every recurring gift under DonationSubscription as well.
        "purpose": purpose,
        "donor_name": payload.name,
        "payment_day": str(datetime.utcnow().day),
        "payment_month": "",
    }
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Monthly sponsorship %s" % case.reference},
                    "unit_amount": payload.monthly_amount_cents,
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            customer_email=payload.email,
            subscription_data={"metadata": metadata},
            metadata=metadata,
            expires_at=int(time.time()) + (svc.CHECKOUT_HOLD_MINUTES + 1) * 60,
            success_url="%s%s/sponsor/thank-you?session_id={CHECKOUT_SESSION_ID}" % (frontend, prefix),
            cancel_url="%s%s/sponsor/%s" % (frontend, prefix, case.reference),
        )
    except Exception as exc:
        sp.status = svc.SP_ABANDONED
        db.commit()
        logger.event(
            ev.SPONSORSHIP_CHECKOUT_CREATED, "Stripe refused the sponsorship checkout",
            level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE, reason=ev.REASON_STRIPE_ERROR,
            case_id=case.id, sponsorship_id=sp.id, email=mask_email(payload.email),
        )
        raise HTTPException(status_code=502, detail="The payment page could not be opened. Please try again.")

    sp.stripe_checkout_session_id = session.id
    sp.checkout_expires_at = datetime.utcnow() + timedelta(minutes=svc.CHECKOUT_HOLD_MINUTES + 1)
    db.commit()
    logger.event(
        ev.SPONSORSHIP_CHECKOUT_CREATED, "handed a sponsor a Stripe checkout session",
        case_id=case.id, reference=case.reference, sponsorship_id=sp.id,
        monthly_amount_cents=sp.monthly_amount_cents, email=mask_email(payload.email),
        stripe_session=session.id,
    )
    return {"id": session.id, "url": getattr(session, "url", None)}


@router.get("/checkout/{session_id}")
async def checkout_result(session_id: str, db: Session = Depends(get_db)):
    """What the thank-you page shows. No personal data: a session id is
    unguessable, but it does travel in a URL."""
    sp = svc.find_sponsorship(db, session_id=session_id)
    if sp is None:
        raise HTTPException(status_code=404, detail="Unknown checkout")
    case = db.query(SponsorshipCase).get(sp.case_id)
    return {
        "status": sp.status,
        "monthly_amount_cents": sp.monthly_amount_cents,
        "reference": case.reference,
        "kind": case.kind,
        "display_name": case.public_name,
    }


@router.post("/apply/{kind}", status_code=status.HTTP_201_CREATED)
async def apply(
    kind: Literal["family", "orphan"],
    request: Request,
    payload: str = Form(...),
    files: list[UploadFile] = File(default_factory=list),
    doc_types: list[str] = Form(default_factory=list),
    db: Session = Depends(get_db),
):
    """File a request, with its documents, in one multipart submission.

    Documents travel with the form rather than through a token issued on
    submission: anyone can type any email into a public form, so handing back
    a portal session here would let a stranger read that address's other
    dossiers. The applicant signs in with an emailed code like everyone else.
    """
    ip = client_ip(request)
    if ip:
        recent = db.query(func.count(SponsorshipCase.id)).filter(
            SponsorshipCase.submitted_ip == ip,
            SponsorshipCase.submitted_at >= datetime.utcnow() - timedelta(hours=1)).scalar() or 0
        if recent >= MAX_APPLICATIONS_PER_IP_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many requests from this connection. Please try again later.")

    schema = FamilyApplication if kind == svc.FAMILY else OrphanApplication
    try:
        data = schema.model_validate(json.loads(payload))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="The form could not be read.")
    except ValidationError as exc:
        # The FastAPI shape, so the form can map each error to its field.
        raise HTTPException(status_code=422, detail=json.loads(exc.json(include_url=False)))

    staged = await files_svc.stage_documents(files, doc_types)
    body = data.model_dump()
    try:
        case = svc.create_case(
            db, kind, body, ip=ip, actor=svc.Actor.applicant(data.email),
            submitter_email=data.email, submitter_type=data.submitter_type, lang=data.lang,
        )
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    stored = await files_svc.store_documents(db, case, staged, uploaded_by="applicant", email=data.email,
                                             actor=svc.Actor.applicant(data.email))
    for send in (emails.applicant_received, emails.staff_new_request):
        try:
            send(case)
        except Exception as exc:  # an email failure must not lose the request
            logger.event(ev.SPONSORSHIP_CASE_SUBMITTED, "could not send a sponsorship email",
                         level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                         reason=ev.REASON_EMAIL_SEND_FAILED, case_id=case.id)
    docs = svc.documents_of(db, case.id)
    return {
        "reference": case.reference,
        "kind": case.kind,
        "documents_stored": stored,
        "documents_offered": len(staged),
        "missing_documents": svc.missing_required_docs(case, docs),
    }
