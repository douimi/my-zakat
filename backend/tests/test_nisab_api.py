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
