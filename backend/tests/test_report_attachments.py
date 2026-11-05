"""The report-attachment validator.

This is the least trusted upload path in the application: the submitter portal
is reachable by anyone holding a six-digit code emailed to the dossier's
address. So these tests are mostly about what must be REFUSED, and about the
stored type being the one the bytes prove rather than the one a client claimed.
"""
import pytest

from report_attachments import (
    AttachmentRejected,
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS_PER_REPORT,
    check_attachment,
    check_batch,
    safe_filename,
)

# Minimal real headers — enough for a magic-byte sniffer.
PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR"
       + b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00" + b"\x00" * 64)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"
NOT_ANYTHING = b"just some plain text, not a media file at all" * 4


def accept(**kw):
    kw.setdefault("filename", "f.bin")
    kw.setdefault("declared_content_type", None)
    return check_attachment(**kw)


# ── What is accepted ─────────────────────────────────────────────────

@pytest.mark.parametrize("content,expected_type,expected_kind", [
    (PNG, "image/png", "image"),
    (JPEG, "image/jpeg", "image"),
    (PDF, "application/pdf", "document"),
])
def test_real_files_are_accepted_and_typed_from_their_bytes(
    content, expected_type, expected_kind
):
    got = accept(content=content)
    assert got.content_type == expected_type
    assert got.kind == expected_kind
    assert got.size_bytes == len(content)


def test_a_pdf_with_leading_junk_is_still_a_pdf():
    """Some writers emit bytes before the signature and readers tolerate it."""
    got = accept(content=b"\n\n   " + PDF)
    assert got.content_type == "application/pdf"


def test_a_generic_declared_type_does_not_override_the_bytes():
    """curl and some mobile webviews send application/octet-stream with no MIME
    mapping to consult. That is not a claim, so the bytes win."""
    got = accept(content=PNG, declared_content_type="application/octet-stream")
    assert got.content_type == "image/png"


def test_a_correct_declaration_is_accepted():
    assert accept(content=PNG, declared_content_type="image/png").content_type == "image/png"


def test_charset_parameters_on_the_declared_type_are_ignored():
    got = accept(content=PDF, declared_content_type="application/pdf; charset=binary")
    assert got.content_type == "application/pdf"


# ── What is refused ──────────────────────────────────────────────────

def test_a_spoofed_image_type_is_refused():
    """The point of sniffing: image/gif is a valid type in general, but never
    what PNG bytes are. Storing the truth silently would let a caller's lie
    pass unnoticed."""
    with pytest.raises(AttachmentRejected) as err:
        accept(content=PNG, declared_content_type="image/gif")
    assert "not" in str(err.value).lower()


def test_a_file_claiming_to_be_a_pdf_but_is_not_is_refused_by_name():
    """'Unsupported' would be misleading when the real problem is the lie."""
    with pytest.raises(AttachmentRejected) as err:
        accept(content=NOT_ANYTHING, declared_content_type="application/pdf")
    assert "PDF" in str(err.value)


def test_an_unsupported_file_is_refused():
    with pytest.raises(AttachmentRejected) as err:
        accept(content=NOT_ANYTHING)
    assert "photos, videos and PDF" in str(err.value)


def test_an_executable_disguised_as_a_photo_is_refused():
    """A Windows PE with a .jpg name and an image Content-Type."""
    pe = b"MZ\x90\x00" + b"\x00" * 120 + b"PE\x00\x00" + b"\x00" * 64
    with pytest.raises(AttachmentRejected):
        check_attachment(filename="holiday.jpg",
                         declared_content_type="image/jpeg", content=pe)


def test_an_empty_file_is_refused():
    with pytest.raises(AttachmentRejected) as err:
        accept(content=b"")
    assert "empty" in str(err.value).lower()


def test_an_oversized_file_is_refused_with_the_limit_in_the_message():
    too_big = PNG + b"\x00" * (MAX_ATTACHMENT_BYTES + 1)
    with pytest.raises(AttachmentRejected) as err:
        accept(content=too_big)
    assert "25 MB" in str(err.value)


def test_a_file_exactly_at_the_limit_is_accepted():
    """Off-by-one on a size cap is the classic way a valid upload gets
    refused."""
    padded = PNG + b"\x00" * (MAX_ATTACHMENT_BYTES - len(PNG))
    assert len(padded) == MAX_ATTACHMENT_BYTES
    assert accept(content=padded).size_bytes == MAX_ATTACHMENT_BYTES


# ── Batch guard ──────────────────────────────────────────────────────

def test_too_many_attachments_are_refused_before_anything_is_stored():
    """Counted first, so a 30-file upload does not write 29 objects to S3 and
    then orphan them by refusing the last."""
    with pytest.raises(AttachmentRejected) as err:
        check_batch([object()] * (MAX_ATTACHMENTS_PER_REPORT + 1))
    assert str(MAX_ATTACHMENTS_PER_REPORT) in str(err.value)


@pytest.mark.parametrize("files", [None, [], [object()], [object()] * MAX_ATTACHMENTS_PER_REPORT])
def test_acceptable_batches_pass(files):
    check_batch(files)


# ── Filenames ────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("receipt.pdf", "receipt.pdf"),
    ("../../../etc/passwd", "passwd"),
    ("..\\..\\Windows\\system32\\cmd.exe", "cmd.exe"),
    ("/absolute/path/photo.jpg", "photo.jpg"),
    ("C:\\Users\\x\\invoice.pdf", "invoice.pdf"),
    ("", "attachment"),
    (None, "attachment"),
    ("   ", "attachment"),
    ("...", "attachment"),
    ("with\x00null.pdf", "withnull.pdf"),
])
def test_filenames_are_stripped_of_any_path(raw, expected):
    """The S3 key is generated server-side so this cannot redirect bytes, but
    the name is echoed into a download's Content-Disposition."""
    assert safe_filename(raw) == expected


def test_a_very_long_filename_is_truncated():
    out = safe_filename("a" * 600 + ".pdf")
    assert len(out) <= 255


def test_unicode_filenames_survive():
    assert safe_filename("reçu-février.pdf") == "reçu-février.pdf"
