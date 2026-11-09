"""Supporting documents and profile photos for sponsorship cases.

These files are the most sensitive the application holds — identity papers,
death certificates, medical reports of children — and they arrive from the
least trusted paths (an anonymous form, a six-digit-code portal). So:

  * nothing the client says about a file is believed: the type is what the
    bytes sniff to (report_attachments' checks, shared with completion reports);
  * video is refused: a document is a scan or a photo;
  * every key is random under sponsorship/<case_id>/ (s3_service.private_object_key),
    never the uploader's filename and never under the publicly served images/;
  * the batch is validated in full before the first byte is written, so a
    request refused on its last file leaves nothing behind.
"""
from __future__ import annotations

import io
import logging
import os
import zlib
from typing import Optional

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import log_events as ev
import report_attachments
import s3_service
import sponsorship_service as svc
from http_headers import content_disposition
from logging_config import get_logger
from report_attachments import AttachmentRejected

logger = get_logger(__name__)


def _measured_size(upload: UploadFile) -> int:
    handle = upload.file
    position = handle.tell()
    handle.seek(0, os.SEEK_END)
    size = handle.tell()
    handle.seek(position)
    return size


async def stage_documents(files: list[UploadFile], doc_types: list[str], *, existing: int = 0) -> list:
    """Validate a batch, or raise 400 with a message for the uploader."""
    files = [f for f in (files or []) if f is not None and (f.filename or "")]
    if not files:
        return []
    if existing + len(files) > svc.MAX_DOCUMENTS_PER_REQUEST:
        raise HTTPException(400, "At most %d documents per request." % svc.MAX_DOCUMENTS_PER_REQUEST)
    sizes = [_measured_size(f) for f in files]
    if sum(sizes) > svc.MAX_DOCUMENT_BATCH_BYTES:
        raise HTTPException(400, "These files add up to more than %d MB; send them in several goes."
                            % (svc.MAX_DOCUMENT_BATCH_BYTES // (1024 * 1024)))
    staged = []
    for i, (upload, size) in enumerate(zip(files, sizes)):
        if size > svc.MAX_DOCUMENT_BYTES:
            raise HTTPException(400, "\"%s\" is %.1f MB; the limit is %d MB per document."
                                % (report_attachments.safe_filename(upload.filename), size / (1024 * 1024),
                                   svc.MAX_DOCUMENT_BYTES // (1024 * 1024)))
        head = await upload.read(report_attachments.SNIFF_BYTES)
        await upload.seek(0)
        try:
            checked = report_attachments.check_attachment(
                filename=upload.filename, declared_content_type=upload.content_type,
                content=head, size=size)
        except AttachmentRejected as exc:
            raise HTTPException(400, str(exc))
        if checked.kind == "video":
            raise HTTPException(400, "Send documents as a PDF or a photo, not a video.")
        doc_type = doc_types[i] if i < len(doc_types) else "other"
        staged.append((checked, upload, doc_type if doc_type in svc.DOC_TYPES else "other"))
    return staged


async def store_documents(db: Session, case, staged: list, *, uploaded_by: str,
                          email: Optional[str], actor: svc.Actor) -> int:
    """Write staged files to S3 and record them. Commits. Returns how many landed.

    A file that fails to store is logged and skipped: losing a whole request
    because one scan failed would be worse than a missing page the applicant
    can send again — and the missing-documents list tells them so.
    """
    stored = 0
    for checked, upload, doc_type in staged:
        key = s3_service.private_object_key("sponsorship/%d" % case.id, checked.filename)
        try:
            content = await upload.read()
            s3_service.upload_file(content, key, content_type=checked.content_type,
                                   metadata={"case_id": str(case.id), "doc_type": doc_type})
        except Exception as exc:
            logger.event(
                ev.SPONSORSHIP_DOCUMENT_UPLOADED, "a supporting document could not be stored",
                level=logging.ERROR, exc=exc, outcome=ev.OUTCOME_FAILURE, reason=ev.REASON_UNEXPECTED,
                case_id=case.id, doc_type=doc_type,
            )
            continue
        svc.add_document(db, case, doc_type=doc_type, checked=checked, object_key=key,
                         uploaded_by=uploaded_by, uploaded_by_email=email, actor=actor)
        stored += 1
    db.commit()
    if stored:
        logger.event(ev.SPONSORSHIP_DOCUMENT_UPLOADED, "supporting documents were stored",
                     outcome=ev.OUTCOME_SUCCESS, case_id=case.id, count=stored, uploaded_by=uploaded_by)
    return stored


def stream_object(object_key: str, content_type: str, filename: str, *, inline: bool = True):
    content = s3_service.download_file(object_key)
    if content is None:
        raise HTTPException(404, "The stored file could not be read")
    disposition = content_disposition(filename, "inline" if inline else "attachment")
    return StreamingResponse(
        io.BytesIO(content), media_type=content_type,
        headers={"Content-Disposition": disposition, "Cache-Control": "private, no-store"},
    )


def photo_url_for(case) -> Optional[str]:
    """The public photo route, versioned so a replaced photo is not cached."""
    if not case.public_photo_key:
        return None
    # crc32, not hash(): str hashes are salted per process, so every worker
    # and every restart would mint a different URL for the same photo.
    version = zlib.crc32(case.public_photo_key.encode("utf-8"))
    return "/api/sponsorship/cases/%s/photo?v=%d" % (case.reference, version)
