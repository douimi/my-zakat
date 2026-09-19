"""Submitter-facing half of project proposals — no account required.

Endpoints (all mounted under /api/project-proposals/portal)
───────────────────────────────────────────────────────────
  POST /request-code    → email a six-digit code (404 if the address has none)
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
    """Email a one-time code to an address that has a dossier.

    This endpoint answers truthfully: an address with no proposal gets a 404
    saying so, and a capped one gets a 429 saying so. It therefore reveals
    whether a given address has applied for funding.

    That was a deliberate reversal, recorded in
    docs/superpowers/specs/2026-09-19-funding-menu-and-portal-lookup-design.md.
    The uniform reply it replaced protected a sensitive population from
    enumeration, but it charged the whole cost to the honest applicant who
    mistyped their address: a code screen, and an email that was never coming.
    Against a threat that needs the attacker to know the address already, on a
    small charity's site, that was judged the larger harm. If the applicant
    base grows more exposed, the middle road is to keep the truth but throttle
    how many addresses one IP may test per hour.
    """
    email = payload.email.strip()

    if not _dossiers_for(db, email):
        logger.info("Proposal portal: lookup for an address with no dossier")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We have no proposal filed under this address.",
        )

    code = proposal_otp.issue_code(db, email=email, ip=client_ip(request))
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            # Both caps feed this one message, so it has to be true of the
            # longer: EMAIL_WINDOW_MINUTES is 15, but IP_WINDOW_MINUTES is 60
            # and a shared office IP or NAT is what usually trips it.
            detail=(
                "Too many sign-in codes requested. Please wait and try again later. "
                "This usually clears within 15 minutes, or up to an hour if you "
                "share a network connection with other applicants."
            ),
        )

    email_service.send_proposal_access_code(
        email=email, code=code, ttl_minutes=proposal_otp.CODE_TTL_MINUTES
    )
    return {"sent": True, "message": f"A sign-in code is on its way to {email}."}


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
