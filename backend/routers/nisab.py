"""The public nisab endpoint.

Deliberately unauthenticated and deliberately plain JSON: the site's pages are
client-rendered, so a crawler that does not execute JavaScript sees nothing of
them. This endpoint it can read. That makes it, for now, the one current and
citable fact the domain publishes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import nisab_service
from database import get_db
from logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.get("/")
async def get_nisab(db: Session = Depends(get_db)):
    """The current threshold, or the method alone when it cannot be vouched for.

    The refresh is attempted here rather than on a schedule. It never blocks the
    answer: refresh_if_due swallows its own failures and leaves the cache alone,
    so a dead upstream costs one timeout and nothing else.
    """
    try:
        nisab_service.refresh_if_due(db)
    except Exception:
        # refresh_if_due already handles its own failures; this is a belt for
        # anything unforeseen, because a price lookup must never take down a
        # page the whole site links to.
        logger.exception("Nisab: unexpected failure while refreshing")
    return nisab_service.build_snapshot(db)
