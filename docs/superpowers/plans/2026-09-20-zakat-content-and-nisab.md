# Zakat Content & Live Nisab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the calculators' hardcoded metal prices with a current, dated nisab that refuses to publish a stale figure, and give the four calculator pages plus a new `/nisab` page the crawlable content and structured data that make them rankable at all.

**Architecture:** A backend `nisab_service` caches gold and silver prices in the existing `settings` table and refreshes them lazily, at most once per 24 hours, behind a public `GET /api/nisab`. The frontend reads that endpoint instead of its constants. Five pages gain editorial prose, question-shaped titles with a derived year, and JSON-LD built by the generators already sitting unused in `seo.ts`.

**Tech Stack:** FastAPI, httpx 0.25.2, SQLAlchemy, pytest (in-memory SQLite), React 18 + TypeScript + Tailwind, vitest + @testing-library, react-helmet-async.

---

## Baselines — do not try to fix these

- Backend: `cd backend && python -m pytest -q --ignore=tests/integration` reads **`11 failed, 489 passed`**. The 11 pre-date this work on `main` (test_admin 3, test_contact 1, test_main 1, test_settings 1, test_stories 2, test_subscriptions 3). **Always pass `--ignore=tests/integration`** — those hit Stripe and only run when the docker stack is up.
- Frontend: `cd frontend && npx vitest run` reads **`22 failed, 165 passed, 187 total`**. The 22 pre-date this work (`AdminRoute` 1, `Header` 7, `Footer` 3, `Layout` 4, `Contact` 7).
- `npm run lint` is **broken on `main`** (the script passes `--ext`, removed in flat-config; `eslint.config.js` uses `module.exports` in an ESM package). Skip it, say you skipped it.
- `npx tsc --noEmit` emits **77 lines of pre-existing errors** in `src/test/setup.ts`, `src/test/utils.tsx`, `src/utils/__tests__/api.test.ts`, `src/utils/__tests__/donations.test.ts`. Add none.
- `npm run build` succeeds and must keep succeeding.

## Editorial rules — binding on every content task

The site owner chose to publish religious content without scholarly review, after being advised against it. That decision is theirs; these constraints are how the drafting limits the exposure, and they are **not optional**:

1. **State what is agreed; name what is not.** Where schools differ — the gold versus silver threshold, the nisab masses, whether debts are deductible — present the common positions and say they differ. **Never adjudicate.**
2. **No rulings.** Write "many scholars hold…", "the Hanafi school gives…", never "you must" on a contested point.
3. **Every page carries a closing note**: the content is general guidance, and a particular situation should go to a qualified scholar. Use this exact wording so it is consistent:
   > This page is general guidance, not a religious ruling. Zakat depends on your circumstances — for anything specific to your situation, please ask a qualified scholar.
4. **No invented figures.** Every monetary amount either comes from `/api/nisab` at render time or is clearly labelled as an illustrative example with made-up round numbers.
5. **Worked examples use round, obviously-illustrative numbers** (e.g. $10,000 in savings, 100 g of gold), never numbers that could be mistaken for current market data.

## File structure

| Path | Responsibility |
|---|---|
| `backend/nisab_service.py` | **new** — the arithmetic, the settings-backed cache, the lazy refresh |
| `backend/routers/nisab.py` | **new** — `GET /api/nisab`, thin over the service |
| `backend/main.py` | register the router |
| `backend/tests/test_nisab_service.py` | **new** |
| `backend/tests/test_nisab_api.py` | **new** |
| `frontend/src/utils/nisabApi.ts` | **new** — typed client + the "is it usable" predicate |
| `frontend/src/utils/seo.ts` | add `getHowToJsonLd`, `getWebApplicationJsonLd`, `currentYear` |
| `frontend/src/pages/Nisab.tsx` | **new** — the canonical threshold page |
| `frontend/src/pages/ZakatCalculator.tsx` | consume the API; content; title; schema |
| `frontend/src/pages/ZakatOnGold.tsx` | content (it is 73 lines today); title; schema |
| `frontend/src/pages/ZakatAlFitrCalculator.tsx` | content; title; schema |
| `frontend/src/pages/KaffarahCalculator.tsx` | content; title; schema |
| `frontend/src/App.tsx` | the `/nisab` route |
| `frontend/public/sitemap.xml` | add `/nisab` |
| `frontend/public/llms.txt`, `llms-full.txt` | rewrite to point at `/api/nisab` |

---

## Task 1: The nisab service

**Files:**
- Create: `backend/nisab_service.py`
- Test: `backend/tests/test_nisab_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_nisab_service.py`:

```python
"""The nisab figure: its arithmetic, its cache, and its refusal to go stale."""
from datetime import datetime, timedelta

import pytest

from models import Setting


def _set(db, key: str, value: str) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()


def _seed_prices(db, *, gold="95.00", silver="1.10", age_days=0.0) -> None:
    fetched = (datetime.utcnow() - timedelta(days=age_days)).isoformat()
    _set(db, "nisab.gold_price_per_gram_usd", gold)
    _set(db, "nisab.silver_price_per_gram_usd", silver)
    _set(db, "nisab.as_of", fetched)
    _set(db, "nisab.fetched_at", fetched)
    _set(db, "nisab.source", "test-source")


def test_the_thresholds_are_mass_times_price(db_session):
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")

    snap = build_snapshot(db_session)

    assert snap["gold_grams"] == 85
    assert snap["silver_grams"] == 595
    assert snap["nisab_gold_usd"] == pytest.approx(8500.00)
    assert snap["nisab_silver_usd"] == pytest.approx(1190.00)
    assert snap["is_stale"] is False
    assert snap["source"] == "test-source"


def test_the_masses_are_configurable_because_the_schools_differ(db_session):
    """85 g / 595 g are the common figures; the Hanafi convention gives
    87.48 g / 612.36 g. The foundation must be able to adopt either."""
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    _set(db_session, "nisab.gold_grams", "87.48")
    _set(db_session, "nisab.silver_grams", "612.36")

    snap = build_snapshot(db_session)

    assert snap["gold_grams"] == pytest.approx(87.48)
    assert snap["nisab_gold_usd"] == pytest.approx(8748.00)
    assert snap["nisab_silver_usd"] == pytest.approx(1224.72)


def test_a_figure_older_than_the_limit_is_withheld_not_shown(db_session):
    """A wrong number carrying a date is worse than no number."""
    from nisab_service import STALE_AFTER_DAYS, build_snapshot

    _seed_prices(db_session, age_days=STALE_AFTER_DAYS + 1)

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    assert snap["nisab_silver_usd"] is None
    assert snap["gold_price_per_gram_usd"] is None
    assert snap["silver_price_per_gram_usd"] is None
    # The method never expires, so it is always present.
    assert snap["gold_grams"] == 85
    assert snap["silver_grams"] == 595


def test_a_database_with_no_prices_at_all_is_stale_not_broken(db_session):
    from nisab_service import build_snapshot

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    assert snap["as_of"] is None
    assert snap["gold_grams"] == 85


def test_a_successful_fetch_updates_the_cache(db_session, monkeypatch):
    import nisab_service

    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 120.0, "silver": 1.5, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True

    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(120.0)
    assert snap["nisab_gold_usd"] == pytest.approx(10200.0)
    assert snap["is_stale"] is False
    assert snap["source"] == "fake"


def test_a_failed_fetch_leaves_the_last_good_value_alone(db_session, monkeypatch):
    import nisab_service

    _seed_prices(db_session, gold="100.00", silver="2.00")

    def boom():
        raise RuntimeError("upstream down")

    monkeypatch.setattr(nisab_service, "_fetch_prices", boom)

    assert nisab_service.refresh_if_due(db_session) is False

    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(100.0)
    assert snap["is_stale"] is False


def test_the_upstream_is_not_called_twice_inside_the_window(db_session, monkeypatch):
    import nisab_service

    calls = []
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: calls.append(1) or {"gold": 1.0, "silver": 1.0, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True
    assert nisab_service.refresh_if_due(db_session) is False

    assert len(calls) == 1, "a broken or slow upstream must not be hammered"


def test_a_stale_cache_does_trigger_a_refresh(db_session, monkeypatch):
    import nisab_service

    _seed_prices(db_session, age_days=nisab_service.REFRESH_AFTER_HOURS / 24 + 1)
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 50.0, "silver": 0.5, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True
    assert nisab_service.build_snapshot(db_session)["gold_price_per_gram_usd"] == pytest.approx(50.0)


def test_no_api_key_behaves_as_stale_rather_than_crashing(db_session, monkeypatch):
    import nisab_service

    monkeypatch.setattr(nisab_service, "METALS_API_KEY", "")

    assert nisab_service.refresh_if_due(db_session) is False
    assert nisab_service.build_snapshot(db_session)["is_stale"] is True
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && python -m pytest tests/test_nisab_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'nisab_service'`

- [ ] **Step 3: Create `backend/nisab_service.py`**

```python
"""The current nisab: the threshold above which zakat is due.

Two things make this more than a multiplication.

The first is that a wrong figure is worse than no figure. A dollar amount
carrying a date reads as authoritative, so this module would rather withhold
one than publish one it cannot vouch for: past STALE_AFTER_DAYS without a
successful refresh, the monetary fields come back as None and only the method
survives. The method -- a mass of gold, a mass of silver -- never expires.

The second is that the masses themselves are not settled. 85 g of gold and
595 g of silver are the figures in widest contemporary use; the Hanafi
convention gives 87.48 g and 612.36 g, from 20 mithqal and 200 dirhams. They
are therefore read from settings, not hardcoded, so the foundation can follow
whichever convention it holds without a code change -- and the page that
displays them says which one is in use.

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

# The two masses, in grams. Defaults are the figures in widest use; both are
# overridable in settings because the schools differ (see the module docstring).
DEFAULT_GOLD_GRAMS = 85.0
DEFAULT_SILVER_GRAMS = 595.0

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
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python -m pytest tests/test_nisab_service.py -v`
Expected: 9 passed.

- [ ] **Step 5: Run the suite**

Run: `cd backend && python -m pytest -q --ignore=tests/integration`
Expected: `11 failed, 498 passed` (489 + 9).

- [ ] **Step 6: Commit**

```bash
git add backend/nisab_service.py backend/tests/test_nisab_service.py
git commit -m "Add a nisab service that withholds a figure it cannot vouch for"
```

---

## Task 2: `GET /api/nisab`

**Files:**
- Create: `backend/routers/nisab.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_nisab_api.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_nisab_api.py`:

```python
"""The public nisab endpoint.

It matters more than most endpoints: it needs no JavaScript, so it is the one
current, citable fact on this domain that an LLM crawler can actually read
while the pages themselves are client-rendered.
"""
from datetime import datetime

from models import Setting


def _seed(db, gold="100.00", silver="2.00"):
    now = datetime.utcnow().isoformat()
    for key, value in (
        ("nisab.gold_price_per_gram_usd", gold),
        ("nisab.silver_price_per_gram_usd", silver),
        ("nisab.as_of", now),
        ("nisab.fetched_at", now),
        ("nisab.source", "test-source"),
    ):
        db.add(Setting(key=key, value=value))
    db.commit()


def test_anyone_may_read_it(client, db_session):
    _seed(db_session)

    resp = client.get("/api/nisab")

    assert resp.status_code == 200


def test_it_reports_the_thresholds_and_the_method(client, db_session):
    _seed(db_session)

    body = client.get("/api/nisab").json()

    assert body["is_stale"] is False
    assert body["nisab_gold_usd"] == 8500.0
    assert body["nisab_silver_usd"] == 1190.0
    assert body["gold_grams"] == 85
    assert body["silver_grams"] == 595
    assert body["as_of"] is not None
    assert body["source"] == "test-source"


def test_with_no_prices_it_reports_the_method_and_no_figure(client, db_session):
    body = client.get("/api/nisab").json()

    assert body["is_stale"] is True
    assert body["nisab_gold_usd"] is None
    assert body["nisab_silver_usd"] is None
    assert body["as_of"] is None
    # Still usable: the method is what a reader needs when the figure is absent.
    assert body["gold_grams"] == 85
    assert body["silver_grams"] == 595
    assert body["stale_after_days"] == 7


def test_a_broken_upstream_does_not_break_the_endpoint(client, db_session, monkeypatch):
    import nisab_service

    _seed(db_session)
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: (_ for _ in ()).throw(RuntimeError("down")))

    resp = client.get("/api/nisab")

    assert resp.status_code == 200
    assert resp.json()["nisab_gold_usd"] == 8500.0
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && python -m pytest tests/test_nisab_api.py -q`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Create `backend/routers/nisab.py`**

```python
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
```

- [ ] **Step 4: Register it in `backend/main.py`**

Add `nisab` to the `from routers import ...` line, then mount it beside the other routers:

```python
app.include_router(nisab.router, prefix="/api/nisab", tags=["nisab"])
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && python -m pytest tests/test_nisab_api.py -v`
Expected: 4 passed.

- [ ] **Step 6: Run the suite**

Run: `cd backend && python -m pytest -q --ignore=tests/integration`
Expected: `11 failed, 502 passed`.

- [ ] **Step 7: Confirm the route really is mounted and open**

```bash
cd backend && TESTING=true python -c "
from main import app
print([r.path for r in app.routes if 'nisab' in getattr(r, 'path', '')])
"
```
Expected: `['/api/nisab/']`.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/nisab.py backend/main.py backend/tests/test_nisab_api.py
git commit -m "Expose the current nisab at GET /api/nisab"
```

---

## Task 3: The frontend client and the missing schema generators

**Files:**
- Create: `frontend/src/utils/nisabApi.ts`
- Modify: `frontend/src/utils/seo.ts`
- Test: `frontend/src/utils/__tests__/nisabApi.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/nisabApi.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchNisab, formatNisabDate, hasUsableFigure } from '../nisabApi'
import type { Nisab } from '../nisabApi'

const fresh: Nisab = {
  gold_grams: 85,
  silver_grams: 595,
  stale_after_days: 7,
  is_stale: false,
  as_of: '2026-09-20T06:00:00Z',
  source: 'https://api.metals.dev/v1/latest',
  gold_price_per_gram_usd: 95.12,
  silver_price_per_gram_usd: 1.08,
  nisab_gold_usd: 8085.2,
  nisab_silver_usd: 642.6,
}

const stale: Nisab = {
  ...fresh,
  is_stale: true,
  as_of: null,
  source: null,
  gold_price_per_gram_usd: null,
  silver_price_per_gram_usd: null,
  nisab_gold_usd: null,
  nisab_silver_usd: null,
}

describe('hasUsableFigure', () => {
  it('is true only when a real, fresh amount came back', () => {
    expect(hasUsableFigure(fresh)).toBe(true)
    expect(hasUsableFigure(stale)).toBe(false)
    expect(hasUsableFigure(null)).toBe(false)
  })

  it('is false when the server says fresh but sends no amount', () => {
    // Defence in depth: the page must never print "$null" or "$0" as a threshold.
    expect(hasUsableFigure({ ...fresh, nisab_gold_usd: null })).toBe(false)
  })
})

describe('fetchNisab', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the snapshot on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(fresh),
    }))

    await expect(fetchNisab()).resolves.toEqual(fresh)
  })

  it('returns null rather than throwing when the endpoint is unreachable', async () => {
    // A price lookup must never take down a page. The caller renders the
    // method instead of a figure.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(fetchNisab()).resolves.toBeNull()
  })

  it('returns null on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(fetchNisab()).resolves.toBeNull()
  })
})

describe('formatNisabDate', () => {
  it('renders a readable date for the "as of" line', () => {
    expect(formatNisabDate('2026-09-20T06:00:00Z')).toMatch(/2026/)
  })

  it('returns an empty string when there is no date', () => {
    expect(formatNisabDate(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/nisabApi.test.ts`
Expected: FAIL — cannot resolve `../nisabApi`.

- [ ] **Step 3: Create `frontend/src/utils/nisabApi.ts`**

```ts
/**
 * The current nisab, read from the backend.
 *
 * Two rules the callers depend on:
 *   - a failure returns null rather than throwing, because a metals price
 *     lookup must never take down a page;
 *   - `hasUsableFigure` is the only sanctioned way to decide whether to print
 *     an amount. A stale or absent figure means the page shows the method --
 *     85 g of gold, 595 g of silver, at today's price -- and no dollars. A
 *     wrong number carrying a date reads as authoritative, which is worse than
 *     no number at all.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Nisab {
  gold_grams: number
  silver_grams: number
  stale_after_days: number
  is_stale: boolean
  as_of: string | null
  source: string | null
  gold_price_per_gram_usd: number | null
  silver_price_per_gram_usd: number | null
  nisab_gold_usd: number | null
  nisab_silver_usd: number | null
}

export const fetchNisab = async (): Promise<Nisab | null> => {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/nisab/`)
    if (!resp.ok) return null
    return (await resp.json()) as Nisab
  } catch {
    return null
  }
}

/** Whether the page may print a dollar amount at all. */
export const hasUsableFigure = (nisab: Nisab | null): boolean =>
  Boolean(
    nisab &&
      !nisab.is_stale &&
      typeof nisab.nisab_gold_usd === 'number' &&
      typeof nisab.nisab_silver_usd === 'number',
  )

export const formatNisabDate = (isoDate: string | null): string =>
  isoDate ? new Date(isoDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : ''

export const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
```

- [ ] **Step 4: Add the three missing pieces to `frontend/src/utils/seo.ts`**

Append (do not modify the existing exports):

```ts
/** The year to stamp on a title. Derived, never hardcoded: a page whose title
 *  says 2026 in January 2027 looks abandoned, which is exactly the opposite of
 *  what a year in a title is for. */
export const currentYear = (): number => new Date().getFullYear()

/** A calculator, described as the free browser tool it is. */
export function getWebApplicationJsonLd(params: {
  name: string
  description: string
  path: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: params.name,
    description: params.description,
    url: `https://myzakat.org${params.path}`,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }
}

/** The steps of a calculation, for the "how to" surfaces. */
export function getHowToJsonLd(params: {
  name: string
  description: string
  steps: { name: string; text: string }[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: params.name,
    description: params.description,
    step: params.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  }
}
```

- [ ] **Step 5: Test the generators**

Append to `frontend/src/utils/__tests__/nisabApi.test.ts` — or create `frontend/src/utils/__tests__/seo.test.ts` if one does not exist; check first and say which you did:

```ts
import { currentYear, getHowToJsonLd, getWebApplicationJsonLd } from '../seo'

describe('schema generators', () => {
  it('stamps the real current year, so a title cannot go stale', () => {
    expect(currentYear()).toBe(new Date().getFullYear())
  })

  it('describes a calculator as a free web application', () => {
    const ld = getWebApplicationJsonLd({
      name: 'Zakat Calculator', description: 'Work out what you owe', path: '/zakat-calculator',
    })

    expect(ld['@type']).toBe('WebApplication')
    expect(ld.url).toBe('https://myzakat.org/zakat-calculator')
    expect(ld.isAccessibleForFree).toBe(true)
    expect((ld.offers as Record<string, unknown>).price).toBe('0')
  })

  it('numbers HowTo steps from one, in order', () => {
    const ld = getHowToJsonLd({
      name: 'How to calculate zakat',
      description: 'Four steps',
      steps: [{ name: 'Add assets', text: 'Total what you own.' },
              { name: 'Compare', text: 'Check it against the nisab.' }],
    })

    const steps = ld.step as { position: number; name: string }[]
    expect(steps.map((s) => s.position)).toEqual([1, 2])
    expect(steps[0].name).toBe('Add assets')
  })
})
```

- [ ] **Step 6: Verify** — run each and report each:
- `cd frontend && npx vitest run src/utils` → your new tests pass
- `cd frontend && npx vitest run` → `22 failed, 175 passed` (165 + 10)
- `cd frontend && npx tsc --noEmit 2>&1 | grep -iE "nisab|seo"` → empty
- `cd frontend && npm run build` → succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/nisabApi.ts frontend/src/utils/seo.ts frontend/src/utils/__tests__
git commit -m "Add the nisab client and the schema generators the pages need"
```

---

## Task 4: The `/nisab` page

This is the page the whole design points at: the canonical, dated statement of
the threshold. **Re-read the "Editorial rules" section at the top of this plan
before writing a word of it.**

**Files:**
- Create: `frontend/src/pages/Nisab.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/public/sitemap.xml`
- Test: `frontend/src/pages/__tests__/Nisab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/__tests__/Nisab.test.tsx`. Mock `../../utils/nisabApi`'s `fetchNisab`; keep the real `hasUsableFigure`, `formatNisabDate` and `formatUsd` via `importActual`, so a bug in the guard fails the test rather than being mocked away.

```tsx
  it('prints the threshold and the date it was taken', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/\$8,085/)).toBeInTheDocument()
    expect(screen.getByText(/\$643/)).toBeInTheDocument()
    expect(screen.getByText(/September 20, 2026/)).toBeInTheDocument()
  })

  it('shows the method and no dollar figure when the data is stale', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(staleNisab())
    renderPage()

    expect(await screen.findByText(/85 grams of gold/i)).toBeInTheDocument()
    expect(screen.getByText(/595 grams of silver/i)).toBeInTheDocument()
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
  })

  it('shows the method and no figure when the endpoint is unreachable', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(null)
    renderPage()

    expect(await screen.findByText(/85 grams of gold/i)).toBeInTheDocument()
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
  })

  it('names the other convention rather than pretending the masses are settled', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/87\.48/)).toBeInTheDocument()
    expect(screen.getByText(/612\.36/)).toBeInTheDocument()
  })

  it('presents both thresholds without ruling between them', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/scholars differ/i)).toBeInTheDocument()
  })

  it('carries the scholar disclaimer', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/not a religious ruling/i)).toBeInTheDocument()
    expect(screen.getByText(/qualified scholar/i)).toBeInTheDocument()
  })
```

Write `renderPage`, `freshNisab` and `staleNisab` to fit — follow the house style in `frontend/src/pages/__tests__/MyProposals.test.tsx`. Wrap in `MemoryRouter` and `HelmetProvider` (`SEOHead` needs the latter; check how other page tests handle it).

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Nisab.test.tsx`
Expected: FAIL — cannot resolve `../Nisab`.

- [ ] **Step 3: Write the page**

`frontend/src/pages/Nisab.tsx`. Match the visual idiom of `ZakatCalculator.tsx` — `min-h-screen bg-gray-50 py-8 sm:py-12`, `max-w-4xl mx-auto px-4 sm:px-6`, cards as `bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8`.

Title: `Nisab ${currentYear()} — Current Gold & Silver Threshold for Zakat`
Description: `The nisab is the minimum wealth at which zakat becomes due. See the current gold and silver thresholds in USD, the date they were taken, and how they are worked out.`
Canonical: `/nisab`

JSON-LD passed to `SEOHead` as an array: `getBreadcrumbJsonLd([{name:'Home',path:'/'},{name:'Nisab',path:'/nisab'}])` and `getFaqJsonLd(...)` built from the FAQ below.

**The content, in this order.** Write it in this shape; the wording below is the
content, not a summary of it:

1. **The figure, first.** A prominent card with the two thresholds and the
   date — "Gold nisab: $8,085 · Silver nisab: $643 · as of September 20, 2026".
   When `hasUsableFigure` is false, this card instead reads: "We show the
   threshold in dollars only when we have a price we can vouch for. Right now
   we do not, so here is the method instead — work it out against today's gold
   or silver price." followed by the two masses.

2. **What the nisab is.**
   > Nisab is the minimum amount of wealth a Muslim must hold, for a full lunar
   > year, before zakat becomes due on it. Below the nisab, no zakat is owed.
   > At or above it, zakat is due at 2.5% of the qualifying wealth.
   >
   > The threshold is not a fixed sum of money. It is defined as the value of a
   > fixed weight of gold or of silver, so it moves with the metal markets.

3. **How it is worked out.** State the two masses in use, and name the other
   convention:
   > We use 85 grams of gold and 595 grams of silver, the figures in widest
   > contemporary use. Multiply the weight by today's price per gram and you
   > have the threshold in your own currency.
   >
   > These weights are not the only ones in circulation. They derive from 20
   > mithqal of gold and 200 dirhams of silver, and the Hanafi convention
   > converts those to 87.48 grams and 612.36 grams respectively. The
   > difference is small in practice, but it is real, and a site that showed
   > one figure without mentioning the other would be hiding a genuine
   > disagreement.

4. **Gold or silver?** This is the contested part. Present both, rule on
   neither:
   > Scholars differ on which threshold to use. The silver nisab is far lower,
   > so it brings more people into zakat and more wealth to those entitled to
   > it; many scholars prefer it for that reason. Others hold that gold is the
   > sounder benchmark today, on the grounds that silver's value relative to
   > everyday goods has fallen a long way since the two thresholds were set as
   > equivalents.
   >
   > If you want to be cautious, use the silver threshold: it is the lower of
   > the two, so it errs towards paying zakat rather than withholding it. If
   > you follow a particular school or teacher, follow their position.

5. **A worked example**, with obviously illustrative numbers:
   > Suppose the silver nisab works out at $640 and you hold $4,000 in savings
   > that you have had for a full lunar year. $4,000 is above $640, so zakat is
   > due: 2.5% of $4,000 is $100.

6. **FAQ** — six questions, each answered in two to four sentences. These are
   the exact questions; they carry the `FAQPage` schema, so the answers must be
   real prose, not stubs:
   - *What is the nisab for zakat?*
   - *Is the nisab based on gold or silver?*
   - *How much is the nisab in 2026?* — the answer states the current figure
     when it is available, and points at the method when it is not.
   - *Does the nisab change?* — yes, daily, because metal prices move.
   - *Do I pay zakat if I am just below the nisab?*
   - *Does the nisab apply per person or per household?*

7. **The disclaimer**, in the exact wording given in the Editorial rules.

8. **Links to the four calculators**, each with a one-line description of what
   it does. This page is where they send readers for the threshold, so it sends
   them back for the arithmetic.

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`, beside the other lazy imports and routes:
```tsx
const Nisab = lazy(() => import('./pages/Nisab'))
```
```tsx
                <Route path="nisab" element={<Nisab />} />
```

- [ ] **Step 5: Add it to the sitemap**

In `frontend/public/sitemap.xml`, add an entry for `https://myzakat.org/nisab`
matching the format of the existing entries — copy the shape of the
`/zakat-calculator` entry exactly, including whichever `changefreq` and
`priority` elements it uses. Given the figure changes daily, `changefreq` should
be `daily`.

- [ ] **Step 6: Verify** — run each and report each:
- `cd frontend && npx vitest run src/pages/__tests__/Nisab.test.tsx` → 6 passed
- `cd frontend && npx vitest run` → `22 failed, 181 passed`
- `cd frontend && npx tsc --noEmit 2>&1 | grep -i nisab` → empty
- `cd frontend && npm run build` → succeeds
- `grep -c "<url>" frontend/public/sitemap.xml` → 23

- [ ] **Step 7: See it against the real stack**

```bash
cd "C:/Users/Otmane/Desktop/Perso/Projets/my-zakat"
docker compose up -d --build frontend backend db
```
Open `http://localhost:3000/nisab` and report what you saw. The backend will
have no `METALS_API_KEY`, so **the stale path is what renders** — confirm the
page shows the two masses and no dollar figure, and that it does not look
broken or empty. That is the degraded state real users will see if the key ever
lapses, so it has to read well.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Nisab.tsx frontend/src/pages/__tests__/Nisab.test.tsx \
        frontend/src/App.tsx frontend/public/sitemap.xml
git commit -m "Add /nisab: the current threshold, dated, with its method"
```

---

## Task 5: The zakat calculator stops guessing at prices

This is the task that fixes a live product defect: the calculator currently
seeds itself with `DEFAULT_GOLD_PRICE_PER_GRAM = 95.00` and
`DEFAULT_SILVER_PRICE_PER_GRAM = 1.10`, hardcoded, with a comment telling the
user to go and check the real rates. Every figure it produces is therefore
built on a guess.

**Files:**
- Modify: `frontend/src/pages/ZakatCalculator.tsx`
- Test: `frontend/src/pages/__tests__/ZakatCalculator.test.tsx` (create if absent — check first)

- [ ] **Step 1: Write the failing tests**

Mock `../../utils/nisabApi`'s `fetchNisab`, keep the rest real via `importActual`:

```tsx
  it('seeds the metal prices from the live figure', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())   // gold 95.12, silver 1.08
    renderPage()

    expect(await screen.findByDisplayValue('95.12')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1.08')).toBeInTheDocument()
  })

  it('still lets the user override the price', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()
    const goldInput = await screen.findByDisplayValue('95.12')

    await user.clear(goldInput)
    await user.type(goldInput, '120')

    expect(goldInput).toHaveValue(120)
  })

  it('says the prices are unavailable rather than inventing them', async () => {
    // The old hardcoded 95.00 / 1.10 must not come back as a silent fallback:
    // a made-up price produces a made-up zakat figure.
    vi.mocked(fetchNisab).mockResolvedValue(null)
    renderPage()

    expect(await screen.findByText(/enter today's price/i)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('95')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('1.1')).not.toBeInTheDocument()
  })

  it('shows the nisab it is comparing against, with its date', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByText(/September 20, 2026/)).toBeInTheDocument()
  })

  it('titles itself with the current year', async () => {
    vi.mocked(fetchNisab).mockResolvedValue(freshNisab())
    renderPage()

    expect(await screen.findByRole('heading', { level: 1 }))
      .toHaveTextContent(String(new Date().getFullYear()))
  })
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/ZakatCalculator.test.tsx`
Expected: FAIL — the constants are still hardcoded and no fetch happens.

- [ ] **Step 3: Replace the constants with the live figure**

In `frontend/src/pages/ZakatCalculator.tsx`:

a) **Delete** both constants and their comment:
```tsx
// Default market prices — used as initial values, the user can override.
// These are conservative reference values; users should check current rates.
const DEFAULT_GOLD_PRICE_PER_GRAM = 95.00
const DEFAULT_SILVER_PRICE_PER_GRAM = 1.10
```

b) Fetch on mount and seed the inputs from the result:
```tsx
  const [nisab, setNisab] = useState<Nisab | null>(null)
  const [nisabLoaded, setNisabLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchNisab().then((snapshot) => {
      if (cancelled) return
      setNisab(snapshot)
      setNisabLoaded(true)
      // Seed the price inputs only from a figure we can vouch for. Falling
      // back to a hardcoded price is how this page used to produce confident
      // numbers from a guess.
      if (hasUsableFigure(snapshot) && snapshot) {
        setGoldPricePerGram(String(snapshot.gold_price_per_gram_usd))
        setSilverPricePerGram(String(snapshot.silver_price_per_gram_usd))
      }
    })
    return () => { cancelled = true }
  }, [])
```
Adapt the state setter names to whatever the file actually calls them — read it
first and say what they were.

c) When the figure is unusable, the price inputs start **empty** with the hint
`Enter today's price per gram` rather than a pre-filled number, and a short
line explains that live prices are temporarily unavailable.

d) Above the result, show what the total is being compared against, with the
date: "Compared against the silver nisab of $643, as of September 20, 2026."
When unusable, show the method instead and link to `/nisab`.

- [ ] **Step 4: Title, description and schema**

Title: `Zakat Calculator ${currentYear()} — How Much Zakat Do I Owe?`
Keep it short: `SEOHead` appends ` | MyZakat – Zakat Distribution Foundation`,
and Google truncates around 60 characters, so the front of the title is what
survives.

Pass an array of JSON-LD to `SEOHead`: `getBreadcrumbJsonLd`, `getFaqJsonLd`
(from the FAQ in step 5), `getWebApplicationJsonLd({ name: 'Zakat Calculator',
… , path: '/zakat-calculator' })`, and `getHowToJsonLd` with these four steps:
1. *Add up your zakatable assets* — cash, savings, gold, silver, investments held for resale, and business stock.
2. *Subtract what you owe* — immediate debts that are due.
3. *Compare the total against the nisab* — the threshold set by 85 g of gold or 595 g of silver at today's price.
4. *Pay 2.5% if you are at or above it* — and if you are below, no zakat is due this year.

- [ ] **Step 5: The content**

600–900 words below the widget, following the **Editorial rules** at the top of
this plan. In order: what the calculator covers and what it does not; the rule
in plain language (2.5%, a full lunar year, at or above the nisab); what counts
as zakatable and what does not, with **debts named as a point on which scholars
differ** rather than settled; the current nisab with its date, read from the
same `nisab` state, linking to `/nisab`; a worked example using round
illustrative numbers ($10,000 savings, $2,000 immediate debt, silver nisab
around $640 → $200 due); then six FAQs — these exact questions, each answered
in two to four sentences of real prose:
- *How much zakat do I pay?*
- *What counts as zakatable wealth?*
- *Do I subtract my debts before calculating zakat?* — present both positions.
- *Does zakat apply to my house or my car?*
- *When is zakat due?*
- *What if my wealth went up and down during the year?*

Then the disclaimer, in the exact wording from the Editorial rules.

- [ ] **Step 6: Verify** — run each and report each:
- `cd frontend && npx vitest run src/pages/__tests__/ZakatCalculator.test.tsx` → 5 passed
- `cd frontend && npx vitest run` → `22 failed, 186 passed`
- `cd frontend && npx tsc --noEmit 2>&1 | grep -i zakatcalculator` → empty
- `cd frontend && npm run build` → succeeds
- `grep -c "DEFAULT_GOLD_PRICE_PER_GRAM\|DEFAULT_SILVER_PRICE_PER_GRAM" frontend/src/pages/ZakatCalculator.tsx` → 0

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ZakatCalculator.tsx frontend/src/pages/__tests__/ZakatCalculator.test.tsx
git commit -m "Stop the zakat calculator building its answer on a hardcoded price"
```

---

## Task 6: The other three calculator pages

Same treatment, three pages. `ZakatOnGold.tsx` is **73 lines** today — it is in
the navigation and the sitemap and is effectively empty, so it gains the most.

**Files:**
- Modify: `frontend/src/pages/ZakatOnGold.tsx`
- Modify: `frontend/src/pages/ZakatAlFitrCalculator.tsx`
- Modify: `frontend/src/pages/KaffarahCalculator.tsx`

For **each** page: the year-stamped title, the four JSON-LD objects
(`getBreadcrumbJsonLd`, `getFaqJsonLd`, `getWebApplicationJsonLd`,
`getHowToJsonLd`), 600–900 words following the **Editorial rules**, a worked
example with round illustrative numbers, six FAQs, and the exact disclaimer.

- [ ] **Step 1: `/zakat-on-gold`**

Title: `Zakat on Gold ${currentYear()} — How Much Do You Pay?`

Content: that gold is zakatable whether held as bullion, coins or jewellery;
**that scholars differ on jewellery in regular personal use** — many hold it is
exempt, others that it is zakatable regardless — presented as a genuine
difference and not resolved; how to weigh and value it (grams × today's price
per gram, by karat); that the nisab for a gold-only holding is the gold
threshold; a worked example (100 g of 22-karat gold); and the link to `/nisab`.

FAQs, exactly these:
- *Is there zakat on gold jewellery I wear?*
- *How do I work out the weight of my gold?*
- *Does the karat matter?*
- *What is the nisab for gold?*
- *Do I pay zakat on gold I inherited?*
- *What about gold held as an investment?*

- [ ] **Step 2: `/zakat-al-fitr-calculator`**

Title: `Zakat al-Fitr ${currentYear()} — How Much to Pay and When`

Content: that it is a per-person obligation paid before the Eid prayer, due for
every member of the household including children; that it is defined as a
measure of staple food (one sa', roughly 2.5–3 kg) and that **scholars differ
on whether its monetary equivalent may be paid instead** — present both; a
worked example for a family of five; and the timing, which is the part people
get wrong.

FAQs, exactly these:
- *How much is Zakat al-Fitr this year?*
- *Who has to pay Zakat al-Fitr?*
- *Do I pay it for my children?*
- *When is the deadline?*
- *Can I pay money instead of food?*
- *What happens if I miss it?*

- [ ] **Step 3: `/kaffarah-calculator`**

Title: `Kaffarah Calculator ${currentYear()} — Expiation for Missed Fasts and Broken Oaths`

Content: what kaffarah is and when it applies — a deliberately broken fast, a
broken oath — and, importantly, **what it is not**: a fast missed through
illness or travel is made up, not expiated. State the graded options in the
order the sources give them, and note that the thresholds and substitutions
differ between schools. A worked example for feeding sixty people.

FAQs, exactly these:
- *What is kaffarah?*
- *When do I owe kaffarah rather than just making up a fast?*
- *How much is the kaffarah for a broken fast?*
- *What is the kaffarah for a broken oath?*
- *Can I pay the money instead of feeding people?*
- *Do I owe kaffarah if I missed a fast because I was ill?*

- [ ] **Step 4: Verify** — run each and report each:
- `cd frontend && npx vitest run` → `22 failed, 186 passed` (no new tests here; the count must not drop)
- `cd frontend && npx tsc --noEmit 2>&1 | grep -iE "ZakatOnGold|ZakatAlFitr|Kaffarah"` → empty
- `cd frontend && npm run build` → succeeds
- `wc -l frontend/src/pages/ZakatOnGold.tsx` → substantially more than 73

- [ ] **Step 5: Check the JSON-LD is actually valid**

For each of the four calculator pages plus `/nisab`, print the JSON-LD the page
passes to `SEOHead` and confirm every object parses and carries `@context` and
`@type`. A quick node script over the built bundle will not do — read the source
and verify the shapes by eye, then confirm in the browser with
`document.querySelectorAll('script[type="application/ld+json"]')` after
`docker compose up -d --build frontend`. **Report the count you saw per page.**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ZakatOnGold.tsx frontend/src/pages/ZakatAlFitrCalculator.tsx \
        frontend/src/pages/KaffarahCalculator.tsx
git commit -m "Give the remaining calculator pages the content that makes them findable"
```

---

## Task 7: The files an LLM can actually read

While the pages are client-rendered, these three files and `/api/nisab` are the
only things on the domain a non-JavaScript crawler sees. They should say what
the site is for, in specifics, and point at the one live fact.

**Files:**
- Modify: `frontend/public/llms.txt`
- Modify: `frontend/public/llms-full.txt`

- [ ] **Step 1: Rewrite `llms.txt`**

Keep the existing structure and voice — read it first. Change three things:

a) Replace the marketing description of the calculators with what they
   concretely compute, naming the inputs.

b) Add a section that states the nisab **method**, which never expires, and
   points at the endpoint for the figure, which does:

```
## Nisab (the threshold at which zakat becomes due)

Nisab is defined as the value of a fixed weight of gold or silver, so it moves
with metal prices and has no fixed dollar value.

- Gold: 85 grams (the Hanafi convention gives 87.48 g)
- Silver: 595 grams (the Hanafi convention gives 612.36 g)
- Zakat rate above the threshold: 2.5%

Scholars differ on which of the two thresholds to use. The silver threshold is
lower, so it brings more payers into zakat.

Current figures in USD, updated daily and machine-readable:
https://myzakat.org/api/nisab

That endpoint reports `is_stale: true` and withholds the dollar amounts when
the underlying price is more than seven days old, rather than publishing a
figure it cannot vouch for.
```

c) Add `https://myzakat.org/nisab` to whatever page list the file carries.

- [ ] **Step 2: Mirror it into `llms-full.txt`**

Same nisab section, plus the longer per-calculator descriptions written in
Tasks 5 and 6 condensed to a paragraph each. **No dollar amounts anywhere in
either file** — they are static and would go stale, which is the exact failure
the staleness guard exists to prevent.

- [ ] **Step 3: Verify**

- `grep -nE "\\$[0-9]" frontend/public/llms.txt frontend/public/llms-full.txt` → no output
- `grep -c "api/nisab" frontend/public/llms.txt frontend/public/llms-full.txt` → at least 1 each
- After `docker compose up -d --build frontend`: `curl -s http://localhost:3000/llms.txt | head -20` returns the new content, and `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/llms.txt` is 200.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/llms.txt frontend/public/llms-full.txt
git commit -m "Point the LLM files at the one current fact a crawler can read"
```

---

## Final verification

- [ ] `cd backend && python -m pytest -q --ignore=tests/integration` → `11 failed, 502 passed`
- [ ] `cd frontend && npx vitest run` → `22 failed, 186 passed`
- [ ] `cd frontend && npm run build` → succeeds
- [ ] `cd frontend && npx tsc --noEmit 2>&1 | wc -l` → 77, unchanged
- [ ] `cd "C:/Users/Otmane/Desktop/Perso/Projets/my-zakat" && E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD=admin123 npx playwright test e2e/proposal-versioning.spec.ts --reporter=list` → 2 passed. Nothing here should touch proposals; this is the check that it did not.
- [ ] `curl -s http://localhost:8000/api/nisab/ | python -m json.tool` → valid JSON with `gold_grams`, `silver_grams` and `is_stale` present. With no `METALS_API_KEY` set it will be stale, which is correct.
- [ ] `grep -rn "DEFAULT_GOLD_PRICE_PER_GRAM\|DEFAULT_SILVER_PRICE_PER_GRAM" frontend/src/` → no output
- [ ] Every one of the five pages, in a browser after `docker compose up -d --build frontend`, shows its content, its year-stamped title, and — with no API key — the method rather than a dollar figure. **That degraded state is what a visitor sees if the key ever lapses, so it has to read well.**

## What this plan does not do, and what it costs

The pages remain client-rendered. Google executes JavaScript, so everything
here — content, titles, JSON-LD — reaches Google. **LLM crawlers do not, so the
pages stay invisible to them**; only `llms.txt`, `llms-full.txt` and
`/api/nisab` are readable. That is the price of deferring pre-rendering, and it
is deliberate. Pre-rendering remains the single highest-value follow-up, and
nothing in this plan conflicts with it.

The foundation still needs to list itself on Charity Navigator and Candid /
GuideStar and publish its EIN. That is administrative work, not code, and it
matters more for LLM trust than several of the tasks above.
