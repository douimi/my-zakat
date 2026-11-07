"""Submitter-facing half of project proposals — no account required.

Endpoints (all mounted under /api/project-proposals/portal)
───────────────────────────────────────────────────────────
  POST /request-code    → email a six-digit code (404 if the address has none)
  POST /verify-code     → exchange the code for a 30-minute portal token
  POST /{id}/report     → file a completion report for a funded project
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

from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import email_service
import proposal_otp
import proposal_service
from auth_utils import (
    PORTAL_TOKEN_MINUTES, create_portal_token, get_portal_actor, get_portal_email,
)
from database import get_db
from logging_config import get_logger, mask_email
import log_events as ev
import logging
import os
import io as _io
import email_service
import report_attachments
import s3_service
from models import ProposalReport, ProposalReportAttachment
from report_attachments import AttachmentRejected
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
    """Every dossier submitted from this address, newest first.

    The current completion report travels with each dossier. Without it the
    portal cannot show a team WHY their report was sent back, and that comment
    is the only thing telling them what to fix.
    """
    dossiers = _dossiers_for(db, email)
    reports = {d.id: proposal_service.current_report(db, d) for d in dossiers}
    attachments = proposal_service.attachments_for(
        db, [r.id for r in reports.values() if r is not None])

    items = []
    for dossier in dossiers:
        payload = proposal_service.serialize_for_portal(
            dossier, proposal_service.current_version(db, dossier))
        report = reports.get(dossier.id)
        if report is not None:
            payload["report"] = proposal_service.serialize_portal_report(
                report, attachments=attachments.get(report.id, []))
        items.append(payload)

    return {"email": email, "items": items}


@router.put("/{proposal_id}")
async def submit_revision(
    proposal_id: int,
    payload: ProposalSubmit,
    request: Request,
    email: str = Depends(get_portal_email),
    acting_staff: Optional[str] = Depends(get_portal_actor),
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
            submitted_by_staff=acting_staff,
        )
    except ProposalNotEditable as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # The event the admin badge keys on: an application the reviewer has
    # already read once has changed underneath them.
    logger.event(
        ev.PROPOSAL_REVISED, "a proposal was revised by its submitter",
        proposal_id=dossier.id, version_no=version.version_no,
        email=mask_email(dossier.email),
        project=(version.project_name or "")[:80],
        on_behalf_by=mask_email(acting_staff) if acting_staff else None,
    )
    email_service.send_proposal_received(
        email=dossier.email,
        name=version.full_name,
        proposal_id=dossier.id,
        version_no=version.version_no,
        project_name=version.project_name,
    )
    return proposal_service.serialize_for_portal(dossier, version)


def _measured_size(upload: UploadFile) -> int:
    """The number of bytes the server received for this file.

    Measured by seeking the spooled file, not read from UploadFile.size or any
    header: it is exact whatever the Starlette version, and nothing the client
    said is involved.
    """
    handle = upload.file
    position = handle.tell()
    handle.seek(0, os.SEEK_END)
    size = handle.tell()
    handle.seek(position)
    return size


def _own_dossier(db: Session, proposal_id: int, email: str) -> ProjectProposal:
    """One of this address's dossiers, or 404.

    The address in the token is the only identity, and it is filtered on here
    exactly as every other portal query does — an id alone must never reach
    another applicant's dossier.
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
    return dossier


async def _stage_uploads(files, existing_sizes=()) -> list:
    """Validate a batch of uploads before anything is written, or raise 400.

    Each file is judged on its leading bytes and its measured size. The
    multipart parser has already spooled every file to disk, so measuring is a
    seek, and the cap applies to bytes the server actually received rather than
    to a Content-Length a client chose. Reading whole files here would hold the
    entire batch, up to 300 MB, in memory at once.

    `existing_sizes` are the files the report already carries: adding to a
    report must not get past the count and total caps a single upload obeys.
    """
    try:
        report_attachments.check_batch(list(existing_sizes) + list(files or []))
        sizes = [_measured_size(upload) for upload in files or []]
        report_attachments.check_total_size(list(existing_sizes) + sizes)
        staged = []
        for upload, size in zip(files or [], sizes):
            head = await upload.read(report_attachments.SNIFF_BYTES)
            await upload.seek(0)
            checked = report_attachments.check_attachment(
                filename=upload.filename,
                declared_content_type=upload.content_type,
                content=head,
                size=size,
            )
            staged.append((checked, upload))
        return staged
    except AttachmentRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def _store_staged(db: Session, dossier: ProjectProposal, report, staged) -> int:
    """Write validated files to S3 and record them; returns how many landed.

    A file that fails to store is logged and skipped rather than undoing the
    others, or the report: losing the narrative because one photo failed would
    be worse than an incomplete set the team can top up.
    """
    stored = 0
    for checked, upload in staged:
        object_key = s3_service.generate_object_key(
            "proposal-reports/%d" % dossier.id, checked.filename)
        try:
            # One file in memory at a time, released before the next is read.
            content = await upload.read()
            s3_service.upload_file(
                content, object_key, content_type=checked.content_type,
                metadata={"proposal_id": str(dossier.id),
                          "report_no": str(report.report_no)},
            )
        except Exception as exc:
            logger.event(
                ev.REPORT_SUBMITTED, "an attachment could not be stored",
                level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                reason=ev.REASON_UNEXPECTED, proposal_id=dossier.id,
                report_no=report.report_no, filename=checked.filename,
            )
            continue
        proposal_service.add_report_attachment(
            db, report, checked=checked, object_key=object_key)
        stored += 1
    return stored


@router.post("/{proposal_id}/report/attachments", status_code=status.HTTP_201_CREATED)
async def add_report_attachments(
    proposal_id: int,
    files: list[UploadFile] = File(default_factory=list),
    email: str = Depends(get_portal_email),
    acting_staff: Optional[str] = Depends(get_portal_actor),
    db: Session = Depends(get_db),
):
    """Add files to the report that is waiting for review.

    For the team whose files did not make it the first time: a 50 MB PDF
    refused under the old limit, an upload cut off by the old 60-second proxy
    timeout, or a report simply sent before the invoices were scanned. Without
    this, a text-only report could only be completed by an admin sending it
    back. Once the report has been reviewed, it is closed to additions; a
    report sent back is answered with a new one.

    New files mark the report unread for the admins, since there is new
    evidence to look at.
    """
    dossier = _own_dossier(db, proposal_id, email)
    report = proposal_service.current_report(db, dossier)
    if (dossier.status != proposal_service.REPORT_SUBMITTED
            or report is None or report.decision is not None):
        raise HTTPException(
            status_code=409,
            detail="Files can only be added to a report that is waiting for review.",
        )
    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one file to add.")

    existing = proposal_service.attachments_for(db, [report.id]).get(report.id, [])
    staged = await _stage_uploads(files, existing_sizes=[a.size_bytes for a in existing])
    stored = await _store_staged(db, dossier, report, staged)

    if stored:
        dossier.admin_seen_report_id = None
        db.commit()

    logger.event(
        ev.REPORT_SUBMITTED, "files were added to a report awaiting review",
        proposal_id=dossier.id, report_no=report.report_no,
        attachments=stored, attachments_offered=len(staged),
        email=mask_email(dossier.email),
        on_behalf_by=mask_email(acting_staff) if acting_staff else None,
    )

    attachments = proposal_service.attachments_for(db, [report.id]).get(report.id, [])
    return {
        "proposal_id": dossier.id,
        "status": dossier.status,
        "attachments_stored": stored,
        "attachments_offered": len(staged),
        "report": proposal_service.serialize_portal_report(report, attachments=attachments),
    }


@router.post("/{proposal_id}/report", status_code=status.HTTP_201_CREATED)
async def submit_completion_report(
    proposal_id: int,
    request: Request,
    narrative: str = Form(...),
    files: list[UploadFile] = File(default_factory=list),
    email: str = Depends(get_portal_email),
    acting_staff: Optional[str] = Depends(get_portal_actor),
    db: Session = Depends(get_db),
):
    """File a completion report for a funded project.

    Multipart rather than JSON because the contract asks for receipts and
    photographs, and those come as files.

    Order matters here. The batch is counted, then every file is read and
    checked, and only then is anything written: a submission refused on its
    last file must not leave the first nineteen objects orphaned in S3, and
    must not leave a report row with half its evidence.
    """
    dossier = _own_dossier(db, proposal_id, email)
    staged = await _stage_uploads(files)

    try:
        report = proposal_service.submit_report(
            db, dossier,
            narrative=narrative,
            submitted_ip=client_ip(request),
            submitted_by_staff=acting_staff,
        )
    except proposal_service.ProposalNotFunded as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except proposal_service.ProposalError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    stored = await _store_staged(db, dossier, report, staged)

    logger.event(
        ev.REPORT_SUBMITTED, "a completion report was filed",
        proposal_id=dossier.id, report_no=report.report_no,
        attachments=stored, attachments_offered=len(staged),
        email=mask_email(dossier.email),
        on_behalf_by=mask_email(acting_staff) if acting_staff else None,
    )

    version = proposal_service.current_version(db, dossier)
    if version is not None:
        try:
            email_service.send_report_received(
                email=dossier.email,
                name=version.full_name,
                proposal_id=dossier.id,
                report_no=report.report_no,
                project_name=version.project_name,
            )
        except Exception as exc:
            logger.event(
                ev.REPORT_SUBMITTED, "could not acknowledge the report by email",
                level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                reason=ev.REASON_EMAIL_SEND_FAILED, proposal_id=dossier.id,
            )

    attachments = proposal_service.attachments_for(db, [report.id]).get(report.id, [])
    return {
        "proposal_id": dossier.id,
        "status": dossier.status,
        "attachments_stored": stored,
        "attachments_offered": len(staged),
        "report": proposal_service.serialize_portal_report(
            report, attachments=attachments),
    }


@router.get("/{proposal_id}/report/attachments/{attachment_id}")
async def download_own_report_attachment(
    proposal_id: int,
    attachment_id: int,
    email: str = Depends(get_portal_email),
    db: Session = Depends(get_db),
):
    """Let a team re-read what it sent.

    Every id is checked against its parent and the dossier against the token's
    address, so an attachment id alone cannot read another applicant's file.
    """
    dossier = _own_dossier(db, proposal_id, email)
    attachment = (
        db.query(ProposalReportAttachment)
        .join(ProposalReport, ProposalReport.id == ProposalReportAttachment.report_id)
        .filter(ProposalReportAttachment.id == attachment_id)
        .filter(ProposalReport.proposal_id == dossier.id)
        .one_or_none()
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    content = s3_service.download_file(attachment.object_key)
    if content is None:
        raise HTTPException(status_code=404, detail="The stored file could not be read")
    return StreamingResponse(
        _io.BytesIO(content),
        media_type=attachment.content_type,
        headers={"Content-Disposition": 'attachment; filename="%s"' % attachment.filename},
    )

