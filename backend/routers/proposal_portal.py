"""Submitter-facing half of project proposals — no account required.

Endpoints (all mounted under /api/project-proposals/portal)
───────────────────────────────────────────────────────────
  POST /request-code    → email a six-digit code (202 whatever the address)
  POST /verify-code     → exchange the code for a 30-minute portal token
  GET  /me              → the dossiers belonging to the token's address
  PUT  /{proposal_id}   → submit the next version of one of them

Three rules hold everywhere in this file:
  * the address in the token is the only identity, and every query filters on it;
  * a dossier belonging to someone else answers 404, never 403 — a 403 would
    confirm it exists;
  * responses are built by serialize_for_portal, a different function from the
    admin serializer, so internal notes cannot leak by accident.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import email_service
import proposal_otp
import proposal_service
from auth_utils import PORTAL_TOKEN_MINUTES, create_portal_token, get_portal_email
from database import get_db
from logging_config import get_logger
from models import ProjectProposal
from proposal_service import ProposalNotEditable
from routers.project_proposals import ProposalSubmit, client_ip

logger = get_logger(__name__)
router = APIRouter()

# Identical for a known and an unknown address: this endpoint must not let
# anyone discover who has applied for funding.
OPAQUE_REQUEST_REPLY = {
    "message": "If that address has a proposal with us, a sign-in code is on its way."
}


class CodeRequest(BaseModel):
    email: EmailStr


class CodeVerification(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


def _dossiers_for(db: Session, email: str) -> list[ProjectProposal]:
    return (
        db.query(ProjectProposal)
        .filter(func.lower(ProjectProposal.email) == email.strip().lower())
        .order_by(ProjectProposal.submitted_at.desc())
        .all()
    )


@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
async def request_code(payload: CodeRequest, request: Request, db: Session = Depends(get_db)):
    """Email a one-time code, but only if the address actually has a dossier.

    Every caller gets the same 202 and the same body: an unknown address, a
    known one, and a known one over the rate limit are indistinguishable from
    outside. The limit still holds — a capped caller simply receives no email.
    """
    email = payload.email.strip()

    if not _dossiers_for(db, email):
        logger.info("Proposal portal: code requested for an address with no dossier")
        return OPAQUE_REQUEST_REPLY

    code = proposal_otp.issue_code(db, email=email, ip=client_ip(request))
    if code is None:
        # Rate limited. Answer exactly as for an unknown address rather than
        # 429: a 429 only ever reached addresses that HAVE a dossier, which
        # turned three unauthenticated posts into a way of asking "has this
        # person applied for funding?". The opaque wording already covers
        # sending nothing -- "if that address has a proposal with us".
        logger.warning("Proposal portal: code request rate-limited for %s", email)
        return OPAQUE_REQUEST_REPLY

    email_service.send_proposal_access_code(
        email=email, code=code, ttl_minutes=proposal_otp.CODE_TTL_MINUTES
    )
    return OPAQUE_REQUEST_REPLY


@router.post("/verify-code")
async def verify_code(payload: CodeVerification, db: Session = Depends(get_db)):
    """Exchange a valid code for a portal token."""
    if not proposal_otp.verify_code(db, email=payload.email, code=payload.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is not valid. Request a new one and try again.",
        )
    logger.info("Proposal portal: sign-in succeeded")
    return {
        "token": create_portal_token(payload.email.strip()),
        "expires_in": PORTAL_TOKEN_MINUTES * 60,
    }


@router.get("/me")
async def my_proposals(
    email: str = Depends(get_portal_email),
    db: Session = Depends(get_db),
):
    """Every dossier submitted from this address, newest first."""
    dossiers = _dossiers_for(db, email)
    return {
        "email": email,
        "items": [
            proposal_service.serialize_for_portal(d, proposal_service.current_version(db, d))
            for d in dossiers
        ],
    }


@router.put("/{proposal_id}")
async def submit_revision(
    proposal_id: int,
    payload: ProposalSubmit,
    request: Request,
    email: str = Depends(get_portal_email),
    db: Session = Depends(get_db),
):
    """Append the next version of one of this address's dossiers.

    The payload is validated by the same schema as a first submission, so a
    revision can never be less complete than the original. Its `email` field is
    ignored — add_revision takes the dossier's.
    """
    dossier = (
        db.query(ProjectProposal)
        .filter(
            ProjectProposal.id == proposal_id,
            func.lower(ProjectProposal.email) == email.strip().lower(),
        )
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=404, detail="Proposal not found")

    data = payload.model_dump()
    try:
        version = proposal_service.add_revision(
            db, dossier,
            content=data,
            submitted_ip=client_ip(request),
            sms_consent=bool(data.get("sms_consent")),
            sms_consent_text=data.get("sms_consent_text"),
        )
    except ProposalNotEditable as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    logger.info("Proposal #%s revised to version %s", dossier.id, version.version_no)
    email_service.send_proposal_received(
        email=dossier.email,
        name=version.full_name,
        proposal_id=dossier.id,
        version_no=version.version_no,
        project_name=version.project_name,
    )
    return proposal_service.serialize_for_portal(dossier, version)
