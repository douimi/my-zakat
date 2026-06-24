"""Public tracking endpoints: open pixel, click redirect.

Both endpoints are unauthenticated by design (recipients click links in
emails without being logged in). HMAC-signed tokens validate the
request, then we insert an EmailEvent and update the per-recipient +
per-campaign counters.

The endpoints are mounted at /api/tracking/ in main.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from logging_config import get_logger
from marketing.tracking import TRANSPARENT_GIF, looks_like_mpp, parse_token
from models import CampaignSend, EmailEvent, MarketingCampaign

logger = get_logger(__name__)
router = APIRouter()


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


def _no_cache_headers() -> dict[str, str]:
    """Headers that defeat aggressive image caching so opens count each time."""
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        "Content-Type": "image/gif",
    }


@router.get("/open/{token}.gif")
async def track_open(token: str, request: Request, db: Session = Depends(get_db)):
    """Open-pixel endpoint. Always returns a 1x1 GIF regardless of token validity
    (we never want to break the email render); but only inserts an event if the
    token verifies."""
    parsed = parse_token(token)
    if not parsed or parsed[0] != "open":
        return Response(content=TRANSPARENT_GIF, media_type="image/gif", headers=_no_cache_headers())

    _, send_id = parsed

    send = db.query(CampaignSend).filter(CampaignSend.id == send_id, CampaignSend.open_token == token).first()
    if not send:
        return Response(content=TRANSPARENT_GIF, media_type="image/gif", headers=_no_cache_headers())

    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    is_mpp = looks_like_mpp(ua)

    # Insert the event (always — multiple opens per recipient are interesting).
    event = EmailEvent(
        campaign_send_id=send.id,
        outbox_id=send.outbox_id,
        recipient_email=send.recipient_email,
        campaign_id=send.campaign_id,
        event_type="open",
        ip_address=ip,
        user_agent=ua[:1000] if ua else None,
        is_mpp=is_mpp,
        event_metadata={},
    )
    db.add(event)

    # Update per-recipient counters.
    is_first_open = send.open_count == 0
    send.open_count += 1
    if is_first_open:
        send.first_open_at = datetime.utcnow()
        send.is_mpp = is_mpp
        # Per-campaign unique opens increment only on FIRST open per recipient.
        if send.campaign_id and not is_mpp:
            campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == send.campaign_id).first()
            if campaign:
                campaign.opened_count = (campaign.opened_count or 0) + 1
    db.commit()

    return Response(content=TRANSPARENT_GIF, media_type="image/gif", headers=_no_cache_headers())


@router.get("/click/{token}")
async def track_click(
    token: str,
    request: Request,
    u: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Click-redirect endpoint. Records the click, then 302s to the target URL."""
    if not u:
        return Response(status_code=400, content="missing destination")

    # Validate target URL — must be http/https; never let us be an open redirect.
    target = urlparse(u)
    if target.scheme not in ("http", "https") or not target.netloc:
        return Response(status_code=400, content="invalid destination")

    parsed = parse_token(token)
    if not parsed or parsed[0] != "click":
        # Token invalid — still redirect (we never want to break a user's
        # click) but skip the event.
        return RedirectResponse(url=u, status_code=302)

    _, send_id = parsed

    send = db.query(CampaignSend).filter(CampaignSend.id == send_id, CampaignSend.click_token == token).first()
    if not send:
        return RedirectResponse(url=u, status_code=302)

    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")

    event = EmailEvent(
        campaign_send_id=send.id,
        outbox_id=send.outbox_id,
        recipient_email=send.recipient_email,
        campaign_id=send.campaign_id,
        event_type="click",
        ip_address=ip,
        user_agent=ua[:1000] if ua else None,
        url=u[:2000],
        event_metadata={},
    )
    db.add(event)

    is_first_click = send.click_count == 0
    send.click_count += 1
    if is_first_click:
        send.first_click_at = datetime.utcnow()
        # If a click comes in but no open was recorded yet, count it as an open too
        # (some clients fetch links before / instead of the open pixel).
        if send.open_count == 0:
            send.open_count = 1
            send.first_open_at = datetime.utcnow()
            if send.campaign_id:
                campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == send.campaign_id).first()
                if campaign:
                    campaign.opened_count = (campaign.opened_count or 0) + 1
        if send.campaign_id:
            campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == send.campaign_id).first()
            if campaign:
                campaign.clicked_count = (campaign.clicked_count or 0) + 1
    db.commit()

    return RedirectResponse(url=u, status_code=302)
