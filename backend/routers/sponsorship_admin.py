"""Staff half of sponsorship. Mounted under /api/sponsorship/admin.

Review work (reading, verifying documents, deciding, writing the profile,
posting updates) is open to managers and admins. Moving money — recording a
disbursement, ending someone's sponsorship — is admin-only: the person who
decides a case should not also be the only one who can say where its money
went.

Every write goes through sponsorship_service, which records the event in the
same transaction. The router's own job is the HTTP shape and the emails that
follow a committed change.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import log_events as ev
import report_attachments
import s3_service
import sponsorship_emails as emails
import sponsorship_files as files_svc
import sponsorship_service as svc
from auth_utils import get_current_admin, get_current_manager_or_admin
from database import get_db
from logging_config import get_logger
from models import (
    Sponsorship, SponsorshipCase, SponsorshipCaseDocument, SponsorshipCaseEvent,
    SponsorshipFamilyDetails, SponsorshipOrphanDetails, User,
)
from routers.sponsorship_portal import cancel_in_stripe
from sponsorship_schemas import (
    DisbursementRequest, DocumentReview, LinkRequest, NoteRequest, StaffCaseEdit,
    StaffSponsorshipEnd, TransitionRequest, UpdateRequest,
)

logger = get_logger(__name__)
router = APIRouter()

DOC_LABELS = {
    "id_document": "identity document", "death_certificate": "death certificate",
    "birth_certificate": "birth certificate", "guardianship": "guardianship document",
    "school_certificate": "school certificate", "medical_report": "medical report",
    "income_proof": "proof of income", "residence_proof": "proof of residence",
    "association_mandate": "association mandate", "photo": "photo", "receipt": "receipt", "other": "document",
}
DOC_LABELS_AR = {
    "id_document": "وثيقة الهوية", "death_certificate": "شهادة الوفاة", "birth_certificate": "شهادة الميلاد",
    "guardianship": "وثيقة الوصاية", "school_certificate": "الشهادة المدرسية", "medical_report": "التقرير الطبي",
    "income_proof": "إثبات الدخل", "residence_proof": "إثبات السكن", "association_mandate": "تفويض الجمعية",
    "photo": "الصورة", "receipt": "الإيصال", "other": "الوثيقة",
}


def _case(db: Session, case_id: int) -> SponsorshipCase:
    case = db.query(SponsorshipCase).get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _safely(send, *args, **kwargs) -> None:
    """An email that cannot be queued must never undo a decision already committed."""
    try:
        send(*args, **kwargs)
    except Exception as exc:
        logger.event(ev.SPONSORSHIP_CASE_TRANSITIONED, "a sponsorship email could not be queued",
                     level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE,
                     reason=ev.REASON_EMAIL_SEND_FAILED)


# ── Overview and lists ────────────────────────────────────────────────

@router.get("/overview")
async def overview(db: Session = Depends(get_db), staff: User = Depends(get_current_manager_or_admin)):
    return svc.overview(db)


@router.get("/unread")
async def unread(db: Session = Depends(get_db), staff: User = Depends(get_current_manager_or_admin)):
    """For the console's badge, polled every minute: counts only."""
    return svc.unread_counts(db)


@router.get("/cases")
async def list_cases(
    kind: Optional[Literal["family", "orphan"]] = None,
    status_: Optional[str] = Query(None, alias="status"),
    funding: Optional[Literal["unfunded", "partial", "full"]] = None,
    flag: Optional[Literal["unread", "duplicates", "documents", "missing", "aging_out"]] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(get_current_manager_or_admin),
):
    query = db.query(SponsorshipCase)
    if kind:
        query = query.filter(SponsorshipCase.kind == kind)
    if status_:
        wanted = [s for s in status_.split(",") if s in svc.STATUSES]
        if wanted:
            query = query.filter(SponsorshipCase.status.in_(wanted))
    if q:
        like = "%%%s%%" % q.strip().lower()
        fam_ids = [d.case_id for d in db.query(SponsorshipFamilyDetails.case_id)
                   .filter(func.lower(SponsorshipFamilyDetails.head_full_name).like(like)).all()]
        orph_ids = [d.case_id for d in db.query(SponsorshipOrphanDetails.case_id)
                    .filter(func.lower(SponsorshipOrphanDetails.full_name).like(like)).all()]
        query = query.filter(or_(
            func.lower(SponsorshipCase.reference).like(like),
            func.lower(SponsorshipCase.submitter_email).like(like),
            func.lower(SponsorshipCase.submitter_name).like(like),
            func.lower(func.coalesce(SponsorshipCase.organization_name, "")).like(like),
            func.lower(func.coalesce(SponsorshipCase.public_name, "")).like(like),
            SponsorshipCase.id.in_(fam_ids + orph_ids or [-1]),
        ))
    cases = query.order_by(SponsorshipCase.submitted_at.desc()).all()
    cov = svc.coverage_map(db, cases)
    fin = svc.finances_map(db, [c.id for c in cases])
    details = {}
    for model in (SponsorshipFamilyDetails, SponsorshipOrphanDetails):
        ids = [c.id for c in cases]
        if ids:
            details.update({d.case_id: d for d in db.query(model).filter(model.case_id.in_(ids)).all()})
    docs: dict[int, list] = {}
    if cases:
        for d in db.query(SponsorshipCaseDocument).filter(
                SponsorshipCaseDocument.case_id.in_([c.id for c in cases])).all():
            docs.setdefault(d.case_id, []).append(d)

    rows = []
    for c in cases:
        cdocs = docs.get(c.id, [])
        row = svc.staff_case_summary(
            c, details.get(c.id), cov[c.id], fin[c.id],
            docs_pending=sum(1 for d in cdocs if d.review_status == "pending"),
            missing=svc.missing_required_docs(c, cdocs))
        rows.append(row)

    if funding:
        rows = [r for r in rows if r["status"] == svc.PUBLISHED and r["coverage"]["state"] == funding]
    if flag == "unread":
        rows = [r for r in rows if r["unread"] and r["status"] not in (svc.CLOSED, svc.REJECTED)]
    elif flag == "duplicates":
        rows = [r for r in rows if r["flags"]]
    elif flag == "documents":
        rows = [r for r in rows if r["docs_pending"]]
    elif flag == "missing":
        rows = [r for r in rows if r["missing_documents"] and r["status"] not in (svc.CLOSED, svc.REJECTED)]
    elif flag == "aging_out":
        from datetime import date, timedelta
        limit = (date.today() + timedelta(days=svc.AGING_OUT_WARNING_DAYS)).isoformat()
        rows = [r for r in rows if r.get("ages_out_on") and r["ages_out_on"] <= limit
                and r["status"] not in (svc.CLOSED, svc.REJECTED)]

    counts = {s: 0 for s in svc.STATUSES}
    for c in (db.query(SponsorshipCase.status, func.count(SponsorshipCase.id))
              .filter(SponsorshipCase.kind == kind) if kind else
              db.query(SponsorshipCase.status, func.count(SponsorshipCase.id))).group_by(SponsorshipCase.status).all():
        counts[c[0]] = c[1]
    return {"items": rows, "total": len(rows), "status_counts": counts}


@router.get("/cases/{case_id}")
async def get_case(case_id: int, db: Session = Depends(get_db),
                   staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    view = svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)
    # Opening the case is what clears the unread marker — after building the
    # view, so the page itself still shows what was new.
    svc.mark_seen(db, case)
    return view


@router.get("/cases/{case_id}/public-preview")
async def public_preview(case_id: int, db: Session = Depends(get_db),
                         staff: User = Depends(get_current_manager_or_admin)):
    """Exactly what the public would see, before publishing."""
    case = _case(db, case_id)
    details = svc.details_of(db, case)
    cov = svc.coverage_map(db, [case])[case.id]
    fin = svc.finances_map(db, [case.id])[case.id]
    return svc.public_detail(db, case, details, cov, photo_url=None, finances=fin, related=[])


# ── Edits and decisions ───────────────────────────────────────────────

@router.patch("/cases/{case_id}")
async def edit_case(case_id: int, payload: StaffCaseEdit, db: Session = Depends(get_db),
                    staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    data = payload.model_dump(exclude_unset=True)
    note = data.pop("note", None)
    try:
        changes = svc.staff_edit(db, case, data, staff, note=note)
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"changed": sorted(changes), "case": svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)}


@router.post("/cases/{case_id}/transition")
async def transition(case_id: int, payload: TransitionRequest, db: Session = Depends(get_db),
                     staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    if payload.action == "close" and payload.end_sponsorships and staff.role != "admin" and not staff.is_admin:
        raise HTTPException(status_code=403, detail="Only an administrator can end sponsorships.")
    ending = svc.committed_sponsorships(db, case.id) if payload.action == "close" else []
    try:
        svc.transition(
            db, case, payload.action, staff,
            message=payload.message, note=payload.note,
            approved_monthly_cents=payload.approved_monthly_cents,
            close_reason=payload.close_reason, end_sponsorships=payload.end_sponsorships,
            cancel_subscription=cancel_in_stripe,
        )
    except svc.TransitionRefused as exc:
        raise HTTPException(status_code=409, detail={"message": str(exc), "blockers": exc.blockers})

    last = (db.query(SponsorshipCaseEvent).filter(SponsorshipCaseEvent.case_id == case.id)
            .order_by(SponsorshipCaseEvent.id.desc()).first())
    _safely(emails.applicant_decision, case, payload.action, payload.message, last.id if last else 0)
    for sp in ending:
        _safely(emails.sponsor_case_closed, sp, case, last.id if last else 0)
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


@router.post("/cases/{case_id}/notes")
async def add_note(case_id: int, payload: NoteRequest, db: Session = Depends(get_db),
                   staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    svc.add_note(db, case, staff, payload.note)
    return {"ok": True}


@router.post("/cases/{case_id}/duplicates/clear")
async def clear_duplicates(case_id: int, payload: Optional[NoteRequest] = None, db: Session = Depends(get_db),
                           staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    svc.clear_duplicates(db, case, staff, payload.note if payload else None)
    return {"ok": True}


@router.post("/cases/{case_id}/link")
async def link_family(case_id: int, payload: LinkRequest, db: Session = Depends(get_db),
                      staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    family = None
    if payload.family_reference:
        family = db.query(SponsorshipCase).filter(
            SponsorshipCase.reference == payload.family_reference.strip().upper()).first()
        if family is None:
            raise HTTPException(status_code=404, detail="No case has that reference.")
    try:
        svc.link_orphan_to_family(db, case, family, svc.Actor.staff(staff))
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


# ── Documents and photo ───────────────────────────────────────────────

@router.post("/cases/{case_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_documents(
    case_id: int,
    files: list[UploadFile] = File(default_factory=list),
    doc_types: list[str] = Form(default_factory=list),
    db: Session = Depends(get_db),
    staff: User = Depends(get_current_manager_or_admin),
):
    """Staff add a document received another way (WhatsApp, paper, a visit)."""
    case = _case(db, case_id)
    staged = await files_svc.stage_documents(files, doc_types)
    stored = await files_svc.store_documents(db, case, staged, uploaded_by="staff", email=staff.email,
                                             actor=svc.Actor.staff(staff))
    return {"stored": stored, "case": svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)}


@router.get("/cases/{case_id}/documents/{doc_id}")
async def read_document(case_id: int, doc_id: int, db: Session = Depends(get_db),
                        staff: User = Depends(get_current_manager_or_admin)):
    doc = db.query(SponsorshipCaseDocument).filter(
        SponsorshipCaseDocument.id == doc_id, SponsorshipCaseDocument.case_id == case_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return files_svc.stream_object(doc.object_key, doc.content_type, doc.filename)


@router.post("/cases/{case_id}/documents/{doc_id}/review")
async def review_document(case_id: int, doc_id: int, payload: DocumentReview, db: Session = Depends(get_db),
                          staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    doc = db.query(SponsorshipCaseDocument).filter(
        SponsorshipCaseDocument.id == doc_id, SponsorshipCaseDocument.case_id == case.id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        svc.review_document(db, case, doc, status=payload.status, note=payload.note, staff=staff)
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if payload.status == "rejected":
        labels = DOC_LABELS_AR if case.preferred_language == "ar" else DOC_LABELS
        _safely(emails.applicant_document_refused, case, labels.get(doc.doc_type, doc.doc_type),
                doc.review_note or "", doc.id)
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


_PHOTO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.post("/cases/{case_id}/photo")
async def set_photo(case_id: int, file: UploadFile = File(...), confirm_safe: bool = Form(False),
                    db: Session = Depends(get_db), staff: User = Depends(get_current_manager_or_admin)):
    """Set the public photo. Requires the publication consent and staff's
    explicit statement that the photo is safe to show."""
    case = _case(db, case_id)
    if not case.consent_publication:
        raise HTTPException(status_code=409, detail="The applicant has not consented to publication.")
    if not confirm_safe:
        raise HTTPException(status_code=400, detail="Confirm that this photo does not reveal the family's "
                                                    "identity or location before using it publicly.")
    content = await file.read()
    try:
        checked = report_attachments.check_attachment(
            filename=file.filename, declared_content_type=file.content_type, content=content)
    except report_attachments.AttachmentRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if checked.content_type not in _PHOTO_EXT or len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Use a JPEG, PNG or WebP photo under 8 MB.")
    key = s3_service.private_object_key("sponsorship/%d/public" % case.id, "photo" + _PHOTO_EXT[checked.content_type])
    s3_service.upload_file(content, key, content_type=checked.content_type, metadata={"case_id": str(case.id)})
    old = case.public_photo_key
    case.public_photo_key = key
    svc.record_event(db, case, "photo_set", svc.Actor.staff(staff), changes={"photo": [old, key]})
    db.commit()
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


@router.delete("/cases/{case_id}/photo")
async def remove_photo(case_id: int, db: Session = Depends(get_db),
                       staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    if case.public_photo_key:
        svc.record_event(db, case, "photo_removed", svc.Actor.staff(staff),
                         changes={"photo": [case.public_photo_key, None]})
        case.public_photo_key = None
        db.commit()
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


@router.get("/cases/{case_id}/photo")
async def read_photo(case_id: int, db: Session = Depends(get_db),
                     staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    if not case.public_photo_key:
        raise HTTPException(status_code=404, detail="No photo")
    ext = case.public_photo_key.rsplit(".", 1)[-1]
    ctype = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
    return files_svc.stream_object(case.public_photo_key, ctype, "photo.%s" % ext)


# ── Money and news ────────────────────────────────────────────────────

@router.post("/cases/{case_id}/disbursements", status_code=status.HTTP_201_CREATED)
async def add_disbursement(case_id: int, payload: DisbursementRequest, db: Session = Depends(get_db),
                           staff: User = Depends(get_current_admin)):
    case = _case(db, case_id)
    try:
        svc.record_disbursement(db, case, staff, payload.model_dump())
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


@router.post("/cases/{case_id}/updates", status_code=status.HTTP_201_CREATED)
async def post_update(case_id: int, payload: UpdateRequest, db: Session = Depends(get_db),
                      staff: User = Depends(get_current_manager_or_admin)):
    case = _case(db, case_id)
    try:
        update = svc.post_update(db, case, staff, payload.model_dump())
    except svc.SponsorshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if payload.notify_sponsors:
        for sp in svc.committed_sponsorships(db, case.id):
            _safely(emails.sponsor_update, sp, case, update)
    return svc.staff_view(db, case, photo_url_for=files_svc.photo_url_for)


@router.get("/sponsorships")
async def list_sponsorships(
    status_: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(get_current_manager_or_admin),
):
    query = db.query(Sponsorship, SponsorshipCase).join(SponsorshipCase, SponsorshipCase.id == Sponsorship.case_id)
    if status_:
        query = query.filter(Sponsorship.status.in_(status_.split(",")))
    else:
        query = query.filter(Sponsorship.status != svc.SP_ABANDONED)
    if q:
        like = "%%%s%%" % q.strip().lower()
        query = query.filter(or_(func.lower(Sponsorship.sponsor_email).like(like),
                                 func.lower(Sponsorship.sponsor_name).like(like),
                                 func.lower(SponsorshipCase.reference).like(like)))
    rows = query.order_by(Sponsorship.created_at.desc()).all()
    from models import Donation
    totals = dict(db.query(Donation.sponsorship_id, func.coalesce(func.sum(Donation.amount), 0.0))
                  .filter(Donation.sponsorship_id.in_([s.id for s, _ in rows] or [-1]))
                  .group_by(Donation.sponsorship_id).all())
    return {"items": [{
        "id": s.id, "case_id": c.id, "reference": c.reference, "kind": c.kind, "public_name": c.public_name,
        "sponsor_name": s.sponsor_name, "sponsor_email": s.sponsor_email,
        "monthly_amount_cents": s.monthly_amount_cents, "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_payment_at": s.last_payment_at.isoformat() if s.last_payment_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "end_reason": s.end_reason, "ended_by": s.ended_by,
        "total_given_cents": svc.cents(totals.get(s.id, 0)),
        "created_at": s.created_at.isoformat() if s.created_at else None,
    } for s, c in rows]}


@router.post("/sponsorships/{sponsorship_id}/end")
async def end_sponsorship(sponsorship_id: int, payload: StaffSponsorshipEnd, db: Session = Depends(get_db),
                          staff: User = Depends(get_current_admin)):
    sp = db.query(Sponsorship).get(sponsorship_id)
    if sp is None:
        raise HTTPException(status_code=404, detail="Sponsorship not found")
    if sp.status not in svc.COMMITTED_STATUSES + (svc.SP_PENDING,):
        raise HTTPException(status_code=409, detail="This sponsorship is not running.")
    cancel_in_stripe(sp)
    svc.end_by_staff(db, sp, staff, reason=payload.reason, note=payload.note)
    return {"ok": True, "status": sp.status}
