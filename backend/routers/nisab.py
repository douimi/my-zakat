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


@router.get("")
@router.get("/")
async def get_nisab(db: Session = Depends(get_db)):
    """The current threshold, or the method alone when it cannot be vouched for.

    The refresh is attempted here rather than on a schedule. It never blocks the
    answer: refresh_if_due swallows its own failures and leaves the cache alone,
    so a dead upstream costs one timeout and nothing else.

    Both "" and "/" are declared so that a crawler hitting /api/nisab gets the
    JSON directly rather than a 307 to /api/nisab/. This endpoint's whole
    purpose is to be trivially readable; an extra hop works against that.

    Building the snapshot is inside the guard too, not only the refresh. It
    reads settings rows that are editable by hand, so it can be handed a value
    the arithmetic cannot take; when that happens the answer is the stale shape
    -- the method, no money -- which is what the callers already handle, rather
    than a 500 on the one URL the llms files point a crawler at.
    """
    try:
        nisab_service.refresh_if_due(db)
    except Exception:
        # refresh_if_due already handles its own failures; this is a belt for
        # anything unforeseen, because a price lookup must never take down a
        # page the whole site links to.
        logger.exception("Nisab: unexpected failure while refreshing")

    try:
        return nisab_service.build_snapshot(db)
    except Exception:
        logger.exception("Nisab: could not build the snapshot; serving the method alone")
        return _method_only()


def _method_only() -> dict:
    """The stale shape: every field a caller reads, no dollar amount in any of them."""
    return {
        "gold_grams": nisab_service.DEFAULT_GOLD_GRAMS,
        "silver_grams": nisab_service.DEFAULT_SILVER_GRAMS,
        "stale_after_days": nisab_service.STALE_AFTER_DAYS,
        "is_stale": True,
        "as_of": None,
        "source": None,
        "gold_price_per_gram_usd": None,
        "silver_price_per_gram_usd": None,
        "nisab_gold_usd": None,
        "nisab_silver_usd": None,
    }
