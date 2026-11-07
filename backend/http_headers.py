"""HTTP header helpers.

Content-Disposition with a name that came from a person: an uploaded file's
name, or a donor's. HTTP headers are latin-1 on the wire, and Starlette
encodes them that way, so an Arabic filename such as "تقرير.pdf" raised
UnicodeEncodeError while the response was being built: a 500, and the file
never reached the admin who asked for it.

RFC 6266 has the answer every current browser supports: a plain-ASCII
`filename=` as a fallback, and the real name, UTF-8 and percent-encoded, in
`filename*=`. A browser that understands the second (all of them) saves the
file under its true name; anything older gets a readable ASCII one.
"""
from __future__ import annotations

import os
import re
import unicodedata
from urllib.parse import quote

_UNSAFE_ASCII = re.compile(r"[^A-Za-z0-9._ -]+")


def _ascii_fallback(name: str) -> str:
    """A latin-1-safe stand-in that keeps the extension.

    Accents fold to their base letter ("é" -> "e"). Scripts with no ASCII form
    (Arabic, Cyrillic, CJK) fold to nothing, so the name falls back to "file"
    plus the original extension, which is what decides how the file opens.
    """
    # Split first, fold the stem alone: folding the whole of "تقرير.pdf" leaves
    # ".pdf", whose stem then reads as "pdf".
    stem, ext = os.path.splitext(name)
    ext = ext if re.fullmatch(r"\.[A-Za-z0-9]{1,10}", ext or "") else ""
    folded = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    folded = _UNSAFE_ASCII.sub("_", folded).strip(" ._")
    if not re.search(r"[A-Za-z0-9]", folded):
        return "file" + ext
    return folded[:150] + ext


def content_disposition(filename: str | None, disposition: str = "attachment") -> str:
    """A Content-Disposition value that is safe for any filename."""
    # Line breaks in a header value would let a filename inject headers.
    name = re.sub(r"[\r\n\x00]", "", filename or "").strip() or "file"
    fallback = _ascii_fallback(name).replace('"', "").replace("\\", "")
    return "%s; filename=\"%s\"; filename*=UTF-8''%s" % (
        disposition, fallback, quote(name, safe=""))
