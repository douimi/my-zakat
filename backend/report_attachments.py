"""Validation for files attached to a completion report.

These arrive from the submitter portal, which is reachable by anyone holding a
six-digit code emailed to the dossier's address. That is the least trusted
upload path in the application, so nothing the client says about a file is
believed: the stored Content-Type is the one the BYTES sniff to, and a declared
type that contradicts the bytes is a refusal rather than a correction.

Images and video reuse media_library_service's sniffer, so the allow-list for
those lives in exactly one place. PDF is added here because the media library
has no use for it while the contract's section 5 asks for "purchase receipts or
invoices" — which is what people actually send.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from media_library_service import (
    canonical_content_type,
    is_allow_listed_content_type,
    media_type_of,
    sniff_content_type,
)

# Per file. A completion report is typically ONE PDF that bundles every invoice
# and photograph, and those run to 50 MB; 25 MB refused exactly the file the
# contract asks for. 100 MB matches the media library's video ceiling, so a
# phone video of the distribution fits too.
#
# Files are validated on their leading bytes and measured size, then sent to S3
# one at a time, so memory per request is bounded by one file, not the batch.
MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024       # 100 MB
# Per submission. This, not the per-file cap, is what keeps one portal session
# from filling the bucket.
MAX_REPORT_BYTES = 300 * 1024 * 1024           # 300 MB
MAX_ATTACHMENTS_PER_REPORT = 20
MAX_FILENAME_LENGTH = 255

# How much of a file the type checks need. The image/video sniffers read at most
# the first 16 bytes and the PDF check the first 1 KB; 8 KB covers both with room.
SNIFF_BYTES = 8 * 1024

PDF_CONTENT_TYPE = "application/pdf"

# `%PDF-` is the signature every PDF starts with. Some writers emit a few
# junk bytes first, which readers tolerate, so the marker is looked for in a
# short prefix rather than only at offset 0.
_PDF_MAGIC = b"%PDF-"
_PDF_SNIFF_WINDOW = 1024


class AttachmentRejected(Exception):
    """A file cannot be stored, with a reason safe to show the uploader."""


@dataclass(frozen=True)
class CheckedAttachment:
    """What is safe to persist about an accepted file."""
    filename: str
    content_type: str   # what the bytes are, not what was declared
    kind: str           # image | video | document
    size_bytes: int


def _looks_like_pdf(content: bytes) -> bool:
    return _PDF_MAGIC in content[:_PDF_SNIFF_WINDOW]


def safe_filename(name: Optional[str]) -> str:
    """A display name with no path in it.

    Only ever used for display and for the Content-Disposition of a download.
    The S3 key is generated server-side, so this cannot influence where bytes
    land — but a name carrying `../` or a drive letter would still be wrong to
    echo back into a download header.
    """
    raw = (name or "").strip()
    # Take the last segment under either separator, so neither
    # "../../etc/passwd" nor "C:\\Windows\\x.png" survives as a path.
    for sep in ("/", "\\"):
        if sep in raw:
            raw = raw.rsplit(sep, 1)[-1]
    raw = raw.replace("\x00", "").strip(". ")
    if not raw:
        return "attachment"
    return raw[:MAX_FILENAME_LENGTH]


def check_attachment(
    *, filename: Optional[str], declared_content_type: Optional[str], content: bytes,
    size: Optional[int] = None,
) -> CheckedAttachment:
    """Accept or refuse one uploaded file.

    `content` may be the whole file or only its first SNIFF_BYTES; `size` is the
    file's measured length when only the head is passed. Measured on the bytes
    the server actually received, never taken from a client header.

    Raises AttachmentRejected with a message meant for the uploader.
    """
    if size is None:
        size = len(content or b"")
    if size == 0:
        raise AttachmentRejected("That file is empty.")
    if size > MAX_ATTACHMENT_BYTES:
        raise AttachmentRejected(
            "That file is %.1f MB; the limit is %d MB."
            % (size / (1024 * 1024), MAX_ATTACHMENT_BYTES // (1024 * 1024))
        )

    declared = (declared_content_type or "").split(";", 1)[0].strip().lower()

    # ── Images and video: the media library's tables and sniffer ──────
    sniffed = sniff_content_type(content)
    if sniffed is not None:
        # A caller that declared a real, specific image/video type which the
        # bytes contradict is claiming something false — refuse rather than
        # silently store the truth. A generic or absent type (curl's
        # application/octet-stream, a webview with no MIME mapping) is not a
        # claim, so the bytes simply win.
        if is_allow_listed_content_type(declared) and declared not in sniffed:
            raise AttachmentRejected(
                "That file says it is %s but its contents are not." % declared)
        return CheckedAttachment(
            filename=safe_filename(filename),
            content_type=canonical_content_type(sniffed),
            kind=media_type_of(sniffed),
            size_bytes=size,
        )

    # ── PDF ───────────────────────────────────────────────────────────
    if _looks_like_pdf(content):
        return CheckedAttachment(
            filename=safe_filename(filename),
            content_type=PDF_CONTENT_TYPE,
            kind="document",
            size_bytes=size,
        )

    # A declared PDF whose bytes are not a PDF gets the same treatment as a
    # spoofed image: named explicitly, because "unsupported" would be
    # misleading when the real problem is that the file is not what it claims.
    if declared == PDF_CONTENT_TYPE:
        raise AttachmentRejected("That file says it is a PDF but its contents are not.")

    raise AttachmentRejected(
        "Only photos, videos and PDF documents can be attached to a report.")


def check_batch(files) -> None:
    """Guard the whole submission before any byte is stored.

    `files` is whatever the router received. Counted first so a 30-file upload
    is refused before 29 objects have been written to S3 and then orphaned by
    the refusal of the last one.
    """
    count = len(files or [])
    if count == 0:
        return
    if count > MAX_ATTACHMENTS_PER_REPORT:
        raise AttachmentRejected(
            "A report can carry at most %d attachments; this one has %d."
            % (MAX_ATTACHMENTS_PER_REPORT, count)
        )


def check_total_size(sizes) -> None:
    """Refuse a submission whose files add up to more than MAX_REPORT_BYTES."""
    total = sum(sizes or [])
    if total > MAX_REPORT_BYTES:
        raise AttachmentRejected(
            "These files add up to %.0f MB; a report can carry at most %d MB in total. "
            "Please send the largest files in a second report."
            % (total / (1024 * 1024), MAX_REPORT_BYTES // (1024 * 1024))
        )
