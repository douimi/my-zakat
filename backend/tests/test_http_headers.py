"""Content-Disposition for names in any script."""
from urllib.parse import unquote

import pytest

from http_headers import content_disposition


def _parts(header):
    fallback = header.split('filename="', 1)[1].split('"', 1)[0]
    real = unquote(header.split("filename*=UTF-8''", 1)[1])
    return fallback, real


@pytest.mark.parametrize("name", [
    "تقرير المشروع.pdf",            # Arabic: the name that crashed in production
    "Отчёт.pdf",                    # Cyrillic
    "報告書.pdf",                    # CJK
    "rapport d'activité.pdf",       # accents
    "receipt.pdf",
])
def test_any_name_makes_a_header_that_can_go_on_the_wire(name):
    header = content_disposition(name)
    header.encode("latin-1")  # what Starlette does; raised UnicodeEncodeError before
    fallback, real = _parts(header)
    assert real == name, "the browser must get the true name back"
    assert fallback.endswith(".pdf"), "the extension decides how the file opens"


def test_a_name_with_no_ascii_form_falls_back_to_file_plus_extension():
    fallback, _ = _parts(content_disposition("تقرير.pdf"))
    assert fallback == "file.pdf"


def test_accents_fold_rather_than_vanish():
    fallback, _ = _parts(content_disposition("activité.pdf"))
    assert fallback == "activite.pdf"


def test_a_plain_name_is_unchanged():
    assert content_disposition("receipt.pdf") == (
        "attachment; filename=\"receipt.pdf\"; filename*=UTF-8''receipt.pdf")


def test_quotes_and_line_breaks_cannot_break_out_of_the_header():
    header = content_disposition('evil"\r\nSet-Cookie: x=1.pdf')
    assert "\r" not in header and "\n" not in header
    fallback, _ = _parts(header)
    assert '"' not in fallback


def test_inline_disposition_and_empty_names():
    assert content_disposition("a.pdf", "inline").startswith("inline; ")
    assert 'filename="file"' in content_disposition("")
    assert 'filename="file"' in content_disposition(None)
