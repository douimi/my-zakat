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
due. No scheduler, nothing to notice has died, and no calls at all when nobody
is visiting.

"Due" is two intervals, not one, because a success and a failure are not the
same event. A successful price is good for REFRESH_AFTER_HOURS (24) -- metal
prices do not move fast enough to justify more. A *failed* attempt only holds
the next attempt off for RETRY_AFTER_MINUTES (60), which is long enough not to
hammer an upstream that is down or rate-limiting, and short enough that a
misconfiguration heals itself. That distinction is the whole point: a missing
METALS_API_KEY used to burn the full 24 hours, so fixing the key and
redeploying still left the site showing the method for another day unless
somebody cleared the row by hand. Now the two are told apart -- nisab.as_of is
the last success, nisab.fetched_at the last attempt -- and only a real success
buys a full day of quiet.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
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
# How long a *failed* attempt holds off the next one. Deliberately much shorter
# than REFRESH_AFTER_HOURS: a broken upstream must not be hammered, but a
# broken configuration must be allowed to notice it has been fixed.
RETRY_AFTER_MINUTES = 60
STALE_AFTER_DAYS = 7

METALS_API_KEY = os.getenv("METALS_API_KEY", "")
METALS_API_URL = os.getenv("METALS_API_URL", "https://api.metals.dev/v1/latest")
FETCH_TIMEOUT_SECONDS = 10


class _RedactApiKey(logging.Filter):
    """Keep the metals API key out of the logs.

    httpx logs the full request URL at INFO, and metals.dev only accepts the
    key as a query parameter -- it answers 401 to an X-API-KEY header. Without
    this filter the key would be written to the backend log on every refresh
    and shipped on to Loki, where it would long outlive any rotation.

    A filter rather than a raised log level: it is thread-safe and permanent,
    and it silences nothing -- it rewrites the one substring that must not be
    written down and passes every record through.
    """

    _PATTERN = re.compile(r"(api_key=)[^&\s\"\']+")

    def _redact(self, value: Any) -> Any:
        if isinstance(value, str):
            return self._PATTERN.sub(r"\1***", value)
        # The argument that actually carries the key is httpx's `request.url`,
        # an httpx.URL object rather than a str (httpx 0.28: _client.py logs
        # 'HTTP Request: %s %s "%s %d %s"' with request.url as an argument).
        # Testing isinstance(str) alone would therefore redact nothing, so
        # anything whose text form carries the key is rendered to its redacted
        # text. A %d argument can never contain "api_key=" and is left as the
        # number it is, so the record still formats.
        text = str(value)
        if "api_key=" in text:
            return self._PATTERN.sub(r"\1***", text)
        return value

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._PATTERN.sub(r"\1***", record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._redact(v) for k, v in record.args.items()}
            else:
                record.args = tuple(self._redact(arg) for arg in record.args)
        return True


# Attached at import time, so both are in place before the first refresh can
# run. Two loggers, because the key escapes by two routes: httpx logs the
# request URL on every call, and this module logs the exception on a failure --
# an httpx.HTTPStatusError renders as "Client error '401 Unauthorized' for url
# '...api_key=...'", so a 401 (exactly what a wrong or expired key produces)
# would otherwise write the key out through nisab_service's own logger.
logging.getLogger("httpx").addFilter(_RedactApiKey())
logger.addFilter(_RedactApiKey())

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


def _usable(value: float | None) -> bool:
    """A quantity we are willing to multiply into a published threshold.

    Absent is not the only unusable state: zero and negative are worse, because
    they produce a figure rather than no figure, and a figure carrying a date
    reads as authoritative.
    """
    return value is not None and value > 0


def _as_datetime(raw: str | None) -> datetime | None:
    """Parse a stored timestamp into a naive UTC datetime.

    Everything this module writes is naive UTC, but a settings row is editable
    by hand through /admin/settings, and `datetime.fromisoformat` will happily
    return an offset-aware value from one. Subtracting that from a naive
    `utcnow()` raises TypeError, which used to surface as a 500 on the one URL
    the llms files point a crawler at. An offset is therefore converted to UTC
    and dropped, so every comparison below has two naive operands.
    """
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        logger.warning("Nisab: timestamp %r is not ISO-8601, treating as absent", raw)
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


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

    gold = float(gold)
    silver = float(silver)
    # A zero or negative price is not a price. Caching one would publish a
    # $0 threshold wearing today's date, which is exactly the authoritative
    # wrong answer this module exists to avoid -- so it is rejected here,
    # before it reaches the cache, like any other unusable payload.
    if gold <= 0 or silver <= 0:
        raise ValueError(f"upstream returned a non-positive price: gold={gold}, silver={silver}")

    return {"gold": gold, "silver": silver, "source": METALS_API_URL}


def refresh_if_due(db: Session) -> bool:
    """Refresh the cached prices when they are due.

    Two intervals, because a success and a failure mean different things (see
    the module docstring). A price that succeeded less than REFRESH_AFTER_HOURS
    ago needs nothing. Otherwise an attempt is made, unless one was already
    made within RETRY_AFTER_MINUTES -- that shorter window is the anti-hammering
    backoff, and it is what lets a fixed configuration recover on its own
    instead of waiting out a full day.

    Returns True only when the cache was actually updated. A failure of any
    kind -- no key, timeout, non-200, unusable payload -- is logged and leaves
    the previous values exactly as they were, then still stamps the attempt so
    a broken upstream is not called again before the retry window is out.
    """
    now = datetime.utcnow()

    # nisab.as_of is the last *success*. Fresh prices need no refresh at all.
    as_of = _as_datetime(_get(db, _AS_OF))
    if as_of and now - as_of < timedelta(hours=REFRESH_AFTER_HOURS):
        return False

    # nisab.fetched_at is the last *attempt*, successful or not. Reaching here
    # means the prices are due, so this gate is purely about not retrying a
    # failing upstream more often than once an hour.
    fetched_at = _as_datetime(_get(db, _FETCHED_AT))
    if fetched_at and now - fetched_at < timedelta(minutes=RETRY_AFTER_MINUTES):
        return False

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
    configured_gold_grams = _as_float(_get(db, _GOLD_GRAMS), DEFAULT_GOLD_GRAMS)
    configured_silver_grams = _as_float(_get(db, _SILVER_GRAMS), DEFAULT_SILVER_GRAMS)
    # A non-positive configured mass is a broken setting, not a convention. The
    # reported method falls back to the code default so no page ever prints
    # "0 grams of gold", but the figure is withheld below all the same: we do
    # not know which convention was intended, so we publish no dollar amount.
    gold_grams = configured_gold_grams if _usable(configured_gold_grams) else DEFAULT_GOLD_GRAMS
    silver_grams = configured_silver_grams if _usable(configured_silver_grams) else DEFAULT_SILVER_GRAMS

    gold_price = _as_float(_get(db, _GOLD_PRICE))
    silver_price = _as_float(_get(db, _SILVER_PRICE))
    as_of = _as_datetime(_get(db, _AS_OF))

    # "Unusable" is wider than "absent". A settings row can be written by an
    # upstream incident or by hand through /admin/settings, and a zero or
    # negative price -- or a zero or negative mass -- multiplies out to a
    # threshold that is wrong rather than missing. A wrong figure carrying a
    # date reads as authoritative, so any of these withholds the money exactly
    # as an expired price does.
    is_stale = (
        not _usable(gold_price)
        or not _usable(silver_price)
        or not _usable(configured_gold_grams)
        or not _usable(configured_silver_grams)
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
