"""The current nisab: the threshold above which zakat is due.

Two things make this more than a multiplication.

The first is that a wrong figure is worse than no figure. A dollar amount
carrying a date reads as authoritative, so this module would rather withhold
one than publish one it cannot vouch for: past STALE_AFTER_DAYS without a
successful refresh, the monetary fields come back as None and only the method
survives. The method -- a mass of gold, a mass of silver -- never expires.

The second is that the masses themselves are not settled. This site uses
87.48 g of gold and 612.36 g of silver, from 20 mithqal and 200 dirhams --
the same threshold its zakat calculation has always applied, so the published
figure and the calculated one cannot disagree. 85 g and 595 g are the other
figures in common use. The masses are therefore read from settings, not
hardcoded, so the foundation can follow whichever convention it holds without
a code change -- and the page that displays them says which one is in use.

Refreshing is lazy: the endpoint serves the cache and refreshes it when it is
older than REFRESH_AFTER_HOURS. No scheduler, nothing to notice has died, and
no calls at all when nobody is visiting.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

from logging_config import get_logger
from models import Setting

logger = get_logger(__name__)

# The two masses, in grams, and the single definition of them for the whole
# codebase -- the zakat calculation in routers/donations.py imports
# DEFAULT_GOLD_GRAMS from here rather than keeping its own copy. Both are
# overridable in settings because the schools differ (see the module docstring).
DEFAULT_GOLD_GRAMS = 87.48
DEFAULT_SILVER_GRAMS = 612.36

REFRESH_AFTER_HOURS = 24
STALE_AFTER_DAYS = 7

METALS_API_KEY = os.getenv("METALS_API_KEY", "")
METALS_API_URL = os.getenv("METALS_API_URL", "https://api.metals.dev/v1/latest")
FETCH_TIMEOUT_SECONDS = 10

_GOLD_PRICE = "nisab.gold_price_per_gram_usd"
_SILVER_PRICE = "nisab.silver_price_per_gram_usd"
_GOLD_GRAMS = "nisab.gold_grams"
_SILVER_GRAMS = "nisab.silver_grams"
_AS_OF = "nisab.as_of"
_FETCHED_AT = "nisab.fetched_at"
_SOURCE = "nisab.source"

# Troy ounce to gram, for providers that quote per ounce.
GRAMS_PER_TROY_OUNCE = 31.1034768


def _get(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else None


def _put(db: Session, key: str, value: str, description: str) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value, description=description))


def _as_float(raw: str | None, fallback: float | None = None) -> float | None:
    if raw is None:
        return fallback
    try:
        return float(raw)
    except (TypeError, ValueError):
        logger.warning("Nisab: setting %r is not a number, ignoring it", raw)
        return fallback


def _as_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        logger.warning("Nisab: timestamp %r is not ISO-8601, treating as absent", raw)
        return None


def _fetch_prices() -> dict[str, Any]:
    """Ask the upstream for gold and silver, in USD per gram.

    Raises on anything that is not a usable answer; every caller treats a raise
    as "keep the cache and try again after the interval".
    """
    if not METALS_API_KEY:
        raise RuntimeError("METALS_API_KEY is not set")

    response = httpx.get(
        METALS_API_URL,
        params={"api_key": METALS_API_KEY, "currency": "USD", "unit": "g"},
        timeout=FETCH_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()

    metals = payload.get("metals") or {}
    gold = metals.get("gold")
    silver = metals.get("silver")
    if gold is None or silver is None:
        raise ValueError(f"upstream payload has no gold/silver: {list(metals)[:5]}")

    unit = (payload.get("unit") or "g").lower()
    if unit in ("toz", "oz", "ounce"):
        gold = float(gold) / GRAMS_PER_TROY_OUNCE
        silver = float(silver) / GRAMS_PER_TROY_OUNCE

    return {"gold": float(gold), "silver": float(silver), "source": METALS_API_URL}


def refresh_if_due(db: Session) -> bool:
    """Refresh the cached prices when they are older than the interval.

    Returns True only when the cache was actually updated. A failure of any
    kind -- no key, timeout, non-200, unusable payload -- is logged and leaves
    the previous values exactly as they were, then still stamps the attempt so
    a broken upstream is not called again before the interval is out.
    """
    fetched_at = _as_datetime(_get(db, _FETCHED_AT))
    if fetched_at and datetime.utcnow() - fetched_at < timedelta(hours=REFRESH_AFTER_HOURS):
        return False

    now = datetime.utcnow()
    try:
        prices = _fetch_prices()
    except Exception as exc:
        logger.warning("Nisab: price refresh failed (%s); keeping the cached value", exc)
        _put(db, _FETCHED_AT, now.isoformat(), "Last nisab refresh attempt (UTC)")
        db.commit()
        return False

    _put(db, _GOLD_PRICE, f"{prices['gold']:.4f}", "Gold price per gram in USD")
    _put(db, _SILVER_PRICE, f"{prices['silver']:.4f}", "Silver price per gram in USD")
    _put(db, _AS_OF, now.isoformat(), "When the nisab prices were last known good (UTC)")
    _put(db, _FETCHED_AT, now.isoformat(), "Last nisab refresh attempt (UTC)")
    _put(db, _SOURCE, str(prices["source"]), "Where the nisab prices came from")
    db.commit()
    logger.info("Nisab: refreshed from %s", prices["source"])
    return True


def build_snapshot(db: Session) -> dict[str, Any]:
    """The current nisab, or the method alone when the figure cannot be trusted."""
    gold_grams = _as_float(_get(db, _GOLD_GRAMS), DEFAULT_GOLD_GRAMS)
    silver_grams = _as_float(_get(db, _SILVER_GRAMS), DEFAULT_SILVER_GRAMS)

    gold_price = _as_float(_get(db, _GOLD_PRICE))
    silver_price = _as_float(_get(db, _SILVER_PRICE))
    as_of = _as_datetime(_get(db, _AS_OF))

    is_stale = (
        gold_price is None
        or silver_price is None
        or as_of is None
        or datetime.utcnow() - as_of > timedelta(days=STALE_AFTER_DAYS)
    )

    snapshot: dict[str, Any] = {
        # The method never expires, so it is reported whatever the state.
        "gold_grams": gold_grams,
        "silver_grams": silver_grams,
        "stale_after_days": STALE_AFTER_DAYS,
        "is_stale": is_stale,
        "as_of": None if is_stale else as_of.isoformat() + "Z",
        "source": None if is_stale else _get(db, _SOURCE),
        "gold_price_per_gram_usd": None if is_stale else round(gold_price, 4),
        "silver_price_per_gram_usd": None if is_stale else round(silver_price, 4),
        "nisab_gold_usd": None if is_stale else round(gold_grams * gold_price, 2),
        "nisab_silver_usd": None if is_stale else round(silver_grams * silver_price, 2),
    }
    return snapshot
