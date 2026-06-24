"""Tracking helpers: token signing, open-pixel + click-rewrite URL builders,
HTML rewriter that injects them into a campaign body, and MPP detection.

Tokens are HMAC-signed so we can verify integrity at the public endpoint
without trusting the URL.
"""
from __future__ import annotations

import hmac
import os
import re
import secrets
from hashlib import sha256
from typing import Iterable
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-secret-key")
TRACKING_BASE_URL = os.getenv("TRACKING_BASE_URL", os.getenv("FRONTEND_URL", "https://myzakat.org"))

# Apple MPP / proxy fetcher user-agent fragments. When any of these appear,
# we mark the open as MPP so it's excluded from "Engaged opens" stats.
_MPP_UA_FRAGMENTS = (
    "GoogleImageProxy",       # Gmail image-proxy
    "YahooMailProxy",
    "Mediapartners-Google",
    "MicrosoftPreview",
    "Apple-PubSub",
    # Apple Mail Privacy Protection routes through Apple-owned IPs without
    # a distinctive UA — we can't detect it from UA alone. Add IP-range
    # checks if you need precise MPP filtering. For now, we trust the UA
    # signature and treat anything with "preview" in the UA as MPP-ish.
    "ImageProxy",
    "preview",
)

# UTM defaults — appended to every link in marketing campaigns.
DEFAULT_UTM_SOURCE = "myzakat"
DEFAULT_UTM_MEDIUM = "email"


# ─────────────────────────────────────────────────────────────────────
# Token utilities
# ─────────────────────────────────────────────────────────────────────

def _sign(payload: str) -> str:
    """16-char HMAC suffix used to verify tokens at the public endpoint."""
    return hmac.new(SECRET_KEY.encode(), payload.encode(), sha256).hexdigest()[:16]


def make_token(kind: str, send_id: int) -> str:
    """Generate a per-(send, kind) random + HMAC-signed token.

    Format: `<kind>_<random>_<sig>` — we store the whole string in
    campaign_sends.open_token / .click_token. Single-use is not enforced
    (an open pixel can fire multiple times legitimately).
    """
    random_part = secrets.token_urlsafe(12)
    payload = f"{kind}|{send_id}|{random_part}"
    sig = _sign(payload)
    return f"{kind}_{send_id}_{random_part}_{sig}"


def parse_token(token: str) -> tuple[str, int] | None:
    """Verify the HMAC and return (kind, send_id) or None if invalid."""
    try:
        parts = token.split("_")
        if len(parts) != 4:
            return None
        kind, send_id_str, random_part, sig = parts
        send_id = int(send_id_str)
        payload = f"{kind}|{send_id}|{random_part}"
        if not hmac.compare_digest(_sign(payload), sig):
            return None
        return kind, send_id
    except (ValueError, TypeError):
        return None


# ─────────────────────────────────────────────────────────────────────
# URL builders
# ─────────────────────────────────────────────────────────────────────

def open_pixel_url(send_id: int, token: str) -> str:
    return f"{TRACKING_BASE_URL.rstrip('/')}/api/tracking/open/{token}.gif"


def click_url(send_id: int, token: str, target_url: str) -> str:
    """Wrap `target_url` so clicks go through our redirect for tracking."""
    base = f"{TRACKING_BASE_URL.rstrip('/')}/api/tracking/click/{token}"
    return f"{base}?{urlencode({'u': target_url})}"


# ─────────────────────────────────────────────────────────────────────
# HTML rewriting — inject tracking into the campaign body
# ─────────────────────────────────────────────────────────────────────

_HREF_RE = re.compile(r"""(<a\b[^>]*\bhref\s*=\s*)(["'])([^"']+)(["'])""", re.IGNORECASE)


def _append_utms(url: str, *, campaign_id: int, send_id: int) -> str:
    """Append UTM params for analytics + post-donation attribution.

    Idempotent — if the URL already has a utm_source we don't override.
    """
    parsed = urlparse(url)
    # Don't touch mailto:, tel:, javascript:, or absolute non-http URLs.
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return url
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    new_params = {
        "utm_source": DEFAULT_UTM_SOURCE,
        "utm_medium": DEFAULT_UTM_MEDIUM,
        "utm_campaign": str(campaign_id),
        "utm_content": str(send_id),
    }
    for k, v in new_params.items():
        existing.setdefault(k, v)
    return urlunparse(parsed._replace(query=urlencode(existing, doseq=True)))


def rewrite_html_for_tracking(
    body_html: str,
    *,
    campaign_id: int,
    send_id: int,
    click_token: str,
    open_token: str,
    skip_url_prefixes: Iterable[str] = (),
) -> str:
    """Rewrite all <a href> URLs through the click-tracker and inject the open pixel.

    `skip_url_prefixes` lets us avoid rewriting links we already control
    (e.g. unsubscribe URLs that need to stay one-click compliant).
    """
    skip = tuple(skip_url_prefixes) + ("mailto:", "tel:", "#")

    def _replace(match: re.Match) -> str:
        prefix, q1, url, q2 = match.group(1), match.group(2), match.group(3), match.group(4)
        # Skip URLs we don't want to touch.
        if url.startswith(skip):
            return match.group(0)
        # Add UTMs to the underlying URL, then wrap in click redirect.
        utm_url = _append_utms(url, campaign_id=campaign_id, send_id=send_id)
        wrapped = click_url(send_id, click_token, utm_url)
        return f"{prefix}{q1}{wrapped}{q2}"

    rewritten = _HREF_RE.sub(_replace, body_html)

    # Inject the open pixel just before </body> (or at end if no </body>).
    pixel = (
        f'<img src="{open_pixel_url(send_id, open_token)}" '
        f'width="1" height="1" border="0" alt="" '
        f'style="display:block;width:1px;height:1px;border:0;" />'
    )
    if "</body>" in rewritten.lower():
        # Insert before the closing body tag, case-insensitively.
        rewritten = re.sub(r"</body>", pixel + "</body>", rewritten, count=1, flags=re.IGNORECASE)
    else:
        rewritten = rewritten + pixel

    return rewritten


# ─────────────────────────────────────────────────────────────────────
# MPP detection (best-effort)
# ─────────────────────────────────────────────────────────────────────

def looks_like_mpp(user_agent: str | None) -> bool:
    if not user_agent:
        return False
    ua_lower = user_agent.lower()
    return any(frag.lower() in ua_lower for frag in _MPP_UA_FRAGMENTS)


# 1x1 transparent GIF — served from the open-pixel endpoint.
TRANSPARENT_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9"
    b"\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02"
    b"\x02D\x01\x00;"
)
