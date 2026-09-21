"""The public nisab endpoint.

It matters more than most endpoints: it needs no JavaScript, so it is the one
current, citable fact on this domain that an LLM crawler can actually read
while the pages themselves are client-rendered.
"""
from datetime import datetime, timedelta

from models import Setting


def _seed(db, gold="100.00", silver="2.00", fetched_hours_ago=0.0,
          as_of_hours_ago=None):
    """Seed a usable cache.

    The two timestamps mean different things to refresh_if_due: `nisab.as_of`
    is the last success, and prices younger than REFRESH_AFTER_HOURS are not
    refreshed at all; `nisab.fetched_at` is the last attempt, and it only
    governs the shorter retry backoff. So a test that wants the refresh path
    must age `as_of` -- by default it moves with `fetched_hours_ago`, which
    keeps it far inside STALE_AFTER_DAYS and therefore still trustworthy.
    """
    now = datetime.utcnow()
    as_of_age = fetched_hours_ago if as_of_hours_ago is None else as_of_hours_ago
    fetched = (now - timedelta(hours=fetched_hours_ago)).isoformat()
    as_of = (now - timedelta(hours=as_of_age)).isoformat()
    for key, value in (
        ("nisab.gold_price_per_gram_usd", gold),
        ("nisab.silver_price_per_gram_usd", silver),
        ("nisab.as_of", as_of),
        ("nisab.fetched_at", fetched),
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
    assert body["nisab_gold_usd"] == 8748.0
    assert body["nisab_silver_usd"] == 1224.72
    assert body["gold_grams"] == 87.48
    assert body["silver_grams"] == 612.36
    assert body["as_of"] is not None
    assert body["source"] == "test-source"


def test_with_no_prices_it_reports_the_method_and_no_figure(client, db_session):
    body = client.get("/api/nisab").json()

    assert body["is_stale"] is True
    assert body["nisab_gold_usd"] is None
    assert body["nisab_silver_usd"] is None
    assert body["as_of"] is None
    # Still usable: the method is what a reader needs when the figure is absent.
    assert body["gold_grams"] == 87.48
    assert body["silver_grams"] == 612.36
    assert body["stale_after_days"] == 7


def test_a_broken_upstream_does_not_break_the_endpoint(client, db_session, monkeypatch):
    """The refresh must be attempted and must fail, leaving the cache intact.

    Seeding the cache a day old is what makes the refresh due; without it the
    freshness check short-circuits and this test proves nothing. A day old is
    still well inside STALE_AFTER_DAYS, so the figure is served regardless.
    """
    import nisab_service

    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("down")

    _seed(db_session, fetched_hours_ago=nisab_service.REFRESH_AFTER_HOURS + 1)
    monkeypatch.setattr(nisab_service, "_fetch_prices", boom)

    resp = client.get("/api/nisab")

    assert calls == [1], "the refresh must actually have been attempted"
    assert resp.status_code == 200
    assert resp.json()["nisab_gold_usd"] == 8748.0
    assert resp.json()["is_stale"] is False


def test_a_due_refresh_that_succeeds_updates_what_the_endpoint_reports(client, db_session, monkeypatch):
    import nisab_service

    _seed(db_session, fetched_hours_ago=nisab_service.REFRESH_AFTER_HOURS + 1)
    monkeypatch.setattr(nisab_service, "_fetch_prices",
                        lambda: {"gold": 200.0, "silver": 4.0, "source": "fresh-source"})

    body = client.get("/api/nisab").json()

    assert body["nisab_gold_usd"] == 17496.0
    assert body["nisab_silver_usd"] == 2449.44
    assert body["source"] == "fresh-source"


def test_an_offset_bearing_timestamp_does_not_500_the_endpoint(client, db_session):
    """/admin/settings lets a human write nisab.as_of by hand.

    An offset-bearing value used to raise TypeError inside build_snapshot,
    which the router did not guard, and the one URL the llms files point a
    crawler at answered 500.
    """
    _seed(db_session)
    row = db_session.query(Setting).filter(Setting.key == "nisab.as_of").first()
    row.value = datetime.utcnow().isoformat() + "+00:00"
    db_session.commit()

    resp = client.get("/api/nisab")

    assert resp.status_code == 200
    assert resp.json()["nisab_gold_usd"] == 8748.0


def test_a_snapshot_that_cannot_be_built_serves_the_method_not_a_500(client, db_session, monkeypatch):
    """Whatever goes wrong behind it, this endpoint answers in the stale shape."""
    import nisab_service

    def boom(_db):
        raise TypeError("something unforeseen in a settings row")

    monkeypatch.setattr(nisab_service, "build_snapshot", boom)

    resp = client.get("/api/nisab")

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_stale"] is True
    assert body["nisab_gold_usd"] is None
    assert body["gold_grams"] == 87.48
    assert body["stale_after_days"] == 7
