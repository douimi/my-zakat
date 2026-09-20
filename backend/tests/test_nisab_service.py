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
