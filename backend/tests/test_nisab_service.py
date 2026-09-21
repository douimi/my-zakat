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


def _seed_prices(db, *, gold="95.00", silver="1.10", age_days=0.0,
                 attempt_age_days=None) -> None:
    """Seed a cache aged `age_days`.

    `nisab.as_of` is the last success and `nisab.fetched_at` the last attempt;
    refresh_if_due reads them against two different intervals, so a test can
    age them apart with `attempt_age_days`. By default they move together, the
    way a run of successes leaves them.
    """
    as_of = (datetime.utcnow() - timedelta(days=age_days)).isoformat()
    attempt_age = age_days if attempt_age_days is None else attempt_age_days
    fetched = (datetime.utcnow() - timedelta(days=attempt_age)).isoformat()
    _set(db, "nisab.gold_price_per_gram_usd", gold)
    _set(db, "nisab.silver_price_per_gram_usd", silver)
    _set(db, "nisab.as_of", as_of)
    _set(db, "nisab.fetched_at", fetched)
    _set(db, "nisab.source", "test-source")


def test_the_thresholds_are_mass_times_price(db_session):
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")

    snap = build_snapshot(db_session)

    assert snap["gold_grams"] == pytest.approx(87.48)
    assert snap["silver_grams"] == pytest.approx(612.36)
    assert snap["nisab_gold_usd"] == pytest.approx(8748.00)
    assert snap["nisab_silver_usd"] == pytest.approx(1224.72)
    assert snap["is_stale"] is False
    assert snap["source"] == "test-source"


def test_the_masses_are_configurable_because_the_schools_differ(db_session):
    """We default to 87.48 g / 612.36 g, from 20 mithqal and 200 dirhams; the
    other convention in common use gives 85 g / 595 g. The foundation must be
    able to adopt either, so here settings override the defaults."""
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    _set(db_session, "nisab.gold_grams", "85")
    _set(db_session, "nisab.silver_grams", "595")

    snap = build_snapshot(db_session)

    assert snap["gold_grams"] == pytest.approx(85)
    assert snap["silver_grams"] == pytest.approx(595)
    assert snap["nisab_gold_usd"] == pytest.approx(8500.00)
    assert snap["nisab_silver_usd"] == pytest.approx(1190.00)


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
    assert snap["gold_grams"] == pytest.approx(87.48)
    assert snap["silver_grams"] == pytest.approx(612.36)


def test_a_database_with_no_prices_at_all_is_stale_not_broken(db_session):
    from nisab_service import build_snapshot

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    assert snap["as_of"] is None
    assert snap["gold_grams"] == pytest.approx(87.48)


def test_a_successful_fetch_updates_the_cache(db_session, monkeypatch):
    import nisab_service

    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 120.0, "silver": 1.5, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True

    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(120.0)
    assert snap["nisab_gold_usd"] == pytest.approx(10497.6)
    assert snap["is_stale"] is False
    assert snap["source"] == "fake"


def test_a_failed_fetch_leaves_the_last_good_value_alone(db_session, monkeypatch):
    import nisab_service

    # Aged past REFRESH_AFTER_HOURS so the fetch is genuinely attempted; a
    # fresh cache would short-circuit and this test would prove nothing.
    _seed_prices(db_session, gold="100.00", silver="2.00", age_days=2)

    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("upstream down")

    monkeypatch.setattr(nisab_service, "_fetch_prices", boom)

    assert nisab_service.refresh_if_due(db_session) is False
    assert calls == [1], "the refresh must actually have been attempted"

    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(100.0)
    assert snap["is_stale"] is False


def test_the_upstream_is_not_called_twice_inside_the_window(db_session, monkeypatch):
    """A success buys the full REFRESH_AFTER_HOURS of quiet."""
    import nisab_service

    calls = []
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: calls.append(1) or {"gold": 1.0, "silver": 1.0, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True
    assert nisab_service.refresh_if_due(db_session) is False

    assert len(calls) == 1, "prices that fresh need no refresh"


def test_a_stale_cache_does_trigger_a_refresh(db_session, monkeypatch):
    """Both gates are open: the last success is old and so is the last attempt."""
    import nisab_service

    _seed_prices(db_session, age_days=nisab_service.REFRESH_AFTER_HOURS / 24 + 1)
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 50.0, "silver": 0.5, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is True
    assert nisab_service.build_snapshot(db_session)["gold_price_per_gram_usd"] == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# The two intervals. A success is good for a day; a failure is retried within
# the hour. Without the split, a missing METALS_API_KEY stamped the attempt and
# burned the full day, so fixing the key and redeploying changed nothing until
# somebody cleared nisab.fetched_at by hand.
# ---------------------------------------------------------------------------


def test_a_failure_is_not_retried_immediately(db_session, monkeypatch):
    """The 60-minute backoff holds: a down upstream is not hammered."""
    import nisab_service

    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("upstream down")

    monkeypatch.setattr(nisab_service, "_fetch_prices", boom)

    assert nisab_service.refresh_if_due(db_session) is False
    assert nisab_service.refresh_if_due(db_session) is False

    assert len(calls) == 1, "a failing upstream must not be called again straight away"


def test_a_failure_is_retried_once_the_backoff_is_out(db_session, monkeypatch):
    """And a configuration fixed in between heals without anyone clearing a row."""
    import nisab_service

    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("METALS_API_KEY is not set")

    monkeypatch.setattr(nisab_service, "_fetch_prices", boom)
    assert nisab_service.refresh_if_due(db_session) is False

    # Wind the attempt stamp back past RETRY_AFTER_MINUTES -- far short of the
    # 24 hours the old single-interval version would have demanded.
    aged = datetime.utcnow() - timedelta(minutes=nisab_service.RETRY_AFTER_MINUTES + 1)
    _set(db_session, "nisab.fetched_at", aged.isoformat())

    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 140.0, "silver": 2.0, "source": "fixed"})

    assert nisab_service.refresh_if_due(db_session) is True
    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(140.0)
    assert snap["is_stale"] is False
    assert len(calls) == 1


def test_a_recent_success_blocks_a_refresh_even_when_the_attempt_is_old(db_session, monkeypatch):
    """The shorter interval is a backoff, not a second refresh schedule.

    Prices that succeeded an hour ago are fine; an old `fetched_at` must not
    start calling the upstream every hour on top of them.
    """
    import nisab_service

    _seed_prices(db_session, gold="100.00", silver="2.00", age_days=0.04,
                 attempt_age_days=5)

    calls = []
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: calls.append(1) or {"gold": 1.0, "silver": 1.0, "source": "fake"})

    assert nisab_service.refresh_if_due(db_session) is False
    assert calls == [], "a fresh success needs no refresh whatever the attempt stamp says"


def test_no_api_key_behaves_as_stale_rather_than_crashing(db_session, monkeypatch):
    import nisab_service

    monkeypatch.setattr(nisab_service, "METALS_API_KEY", "")

    assert nisab_service.refresh_if_due(db_session) is False
    assert nisab_service.build_snapshot(db_session)["is_stale"] is True


# ---------------------------------------------------------------------------
# Unusable values. "Absent" is not the only way a price can fail to be a price:
# a settings row can be written by an upstream incident or by hand through
# PUT /api/settings/{key}, and zero or negative multiplies out to a figure
# rather than to no figure. A figure carrying a date reads as authoritative.
# ---------------------------------------------------------------------------


def test_a_zero_price_is_withheld_rather_than_published_as_a_zero_threshold(db_session):
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="0", silver="0")

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    assert snap["nisab_silver_usd"] is None
    assert snap["gold_price_per_gram_usd"] is None
    assert snap["as_of"] is None


def test_a_negative_price_is_withheld_too(db_session):
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="-5.00", silver="1.10")

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    # One bad metal withholds both: the page prints money or it does not.
    assert snap["nisab_silver_usd"] is None


def test_a_zero_mass_yields_no_threshold_and_still_states_the_method(db_session):
    """A non-positive mass is a broken setting, not a convention.

    It must not multiply out to a zero threshold, and the method it leaves
    behind must still be a mass a reader can use, not "0 grams of gold".
    """
    from nisab_service import DEFAULT_GOLD_GRAMS, build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    _set(db_session, "nisab.gold_grams", "0")

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_gold_usd"] is None
    assert snap["gold_grams"] == pytest.approx(DEFAULT_GOLD_GRAMS)


def test_a_negative_mass_is_treated_the_same_way(db_session):
    from nisab_service import DEFAULT_SILVER_GRAMS, build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    _set(db_session, "nisab.silver_grams", "-612.36")

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is True
    assert snap["nisab_silver_usd"] is None
    assert snap["silver_grams"] == pytest.approx(DEFAULT_SILVER_GRAMS)


def test_a_non_positive_upstream_price_is_rejected_before_it_is_cached(db_session, monkeypatch):
    """The guard belongs at the door as well as at the window.

    A zero from the upstream must not become a cached zero; it is an unusable
    payload like any other, so the previous good value survives it.
    """
    import nisab_service

    # Both stamps aged, so the fetch is genuinely attempted: a fresh success
    # would short-circuit refresh_if_due and the rejection below never run.
    _seed_prices(db_session, gold="100.00", silver="2.00",
                 age_days=nisab_service.REFRESH_AFTER_HOURS / 24 + 1)

    monkeypatch.setattr(nisab_service, "METALS_API_KEY", "test-key")
    monkeypatch.setattr(
        nisab_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse({"metals": {"gold": 0, "silver": 1.5}, "unit": "g"}),
    )

    assert nisab_service.refresh_if_due(db_session) is False

    snap = nisab_service.build_snapshot(db_session)
    assert snap["gold_price_per_gram_usd"] == pytest.approx(100.0), "the cache must be untouched"
    assert snap["is_stale"] is False


def test_a_negative_upstream_price_is_rejected_too(monkeypatch):
    import nisab_service

    monkeypatch.setattr(nisab_service, "METALS_API_KEY", "test-key")
    monkeypatch.setattr(
        nisab_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse({"metals": {"gold": 95.0, "silver": -1.0}, "unit": "g"}),
    )

    with pytest.raises(ValueError, match="non-positive"):
        nisab_service._fetch_prices()


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


# ---------------------------------------------------------------------------
# Timestamps. Everything this module writes is naive UTC, but /admin/settings
# lets a human write whatever they like into nisab.as_of.
# ---------------------------------------------------------------------------


def test_an_offset_bearing_timestamp_does_not_break_the_arithmetic(db_session):
    """An offset-aware `as_of` used to raise TypeError out of build_snapshot,
    which surfaced as a 500 on the one URL the llms files point a crawler at."""
    from nisab_service import build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    _set(db_session, "nisab.as_of", datetime.utcnow().isoformat() + "+00:00")

    snap = build_snapshot(db_session)

    assert snap["is_stale"] is False
    assert snap["nisab_gold_usd"] == pytest.approx(8748.00)


def test_an_offset_bearing_timestamp_can_still_be_stale(db_session):
    from nisab_service import STALE_AFTER_DAYS, build_snapshot

    _seed_prices(db_session, gold="100.00", silver="2.00")
    old = datetime.utcnow() - timedelta(days=STALE_AFTER_DAYS + 1)
    _set(db_session, "nisab.as_of", old.isoformat() + "+00:00")

    assert build_snapshot(db_session)["is_stale"] is True
