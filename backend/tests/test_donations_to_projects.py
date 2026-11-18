"""Donations given to a fundraising project count towards its raised total."""
import json
from datetime import datetime

import pytest

from models import Donation, DonationSubscription, FundraisingProject


@pytest.fixture(autouse=True)
def _webhooks(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    import routers.donations as donations_module
    donations_module._processed_events.clear()


@pytest.fixture
def stripe_capture(monkeypatch):
    import stripe
    seen = {}

    class Obj:
        id = "cs_test_1"
        url = None

    def session_create(**kw):
        seen["session"] = kw
        return Obj()

    monkeypatch.setattr(stripe, "api_key", "sk_test_fake")
    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(session_create))
    monkeypatch.setattr(stripe.Customer, "create", staticmethod(lambda **kw: type("C", (), {"id": "cus_1"})()))
    monkeypatch.setattr(stripe.Product, "create", staticmethod(lambda **kw: type("P", (), {"id": "prod_1"})()))
    monkeypatch.setattr(stripe.Price, "create", staticmethod(lambda **kw: type("Pr", (), {"id": "price_1"})()))
    return seen


def project(db, **over):
    data = dict(title="Water wells", slug="water-wells-%d" % datetime.utcnow().microsecond,
                short_description="Wells", goal_cents=100000, spent_cents=20000, status="active", is_active=True)
    data.update(over)
    p = FundraisingProject(**data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def webhook(client, monkeypatch, event):
    monkeypatch.setattr("stripe.Webhook.construct_event", lambda payload, sig, secret: event)
    return client.post("/api/donations/stripe-webhook", content=json.dumps(event),
                       headers={"stripe-signature": "t=1,v1=x", "content-type": "application/json"})


def raised(client, slug):
    return client.get("/api/fundraising-projects/by-slug/%s" % slug).json()


def test_a_donation_given_online_is_added_to_the_projects_total(client, db_session, monkeypatch, stripe_capture):
    p = project(db_session)
    r = client.post("/api/donations/create-payment-session", json={
        "amount": 50, "name": "Sara", "email": "sara@example.com", "frequency": "One-Time",
        "fundraising_project_id": p.id})
    assert r.status_code == 200, r.text
    assert stripe_capture["session"]["metadata"]["fundraising_project_id"] == str(p.id)

    webhook(client, monkeypatch, {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_1", "mode": "payment", "amount_total": 5000, "customer_email": "sara@example.com",
        "metadata": stripe_capture["session"]["metadata"]}}})

    body = raised(client, p.slug)
    assert body["raised_online_amount"] == 50.0
    assert body["raised_offline_amount"] == 200.0
    assert body["spent_amount"] == 250.0 and body["progress_percent"] == 25.0
    assert body["donations_count"] == 1


def test_each_monthly_charge_of_a_recurring_gift_goes_to_its_project(client, db_session, monkeypatch, stripe_capture):
    p = project(db_session)
    r = client.post("/api/donations/create-subscription", json={
        "amount": 30, "name": "Omar", "email": "omar@example.com", "interval": "month", "payment_day": 5,
        "fundraising_project_id": p.id})
    assert r.status_code == 200, r.text
    meta = stripe_capture["session"]["subscription_data"]["metadata"]
    assert meta["fundraising_project_id"] == str(p.id)

    db_session.add(DonationSubscription(stripe_subscription_id="sub_9", stripe_customer_id="cus_1", name="Omar",
                                        email="omar@example.com", amount=30, purpose="General Donation",
                                        interval="month", payment_day=5, status="active",
                                        fundraising_project_id=p.id))
    db_session.commit()
    for n in (1, 2):
        webhook(client, monkeypatch, {"id": "evt_inv_%d" % n, "type": "invoice.payment_succeeded", "data": {"object": {
            "id": "in_%d" % n, "subscription": "sub_9", "amount_paid": 3000}}})

    assert raised(client, p.slug)["raised_online_amount"] == 60.0


def test_a_closed_project_refuses_new_donations(client, db_session, stripe_capture):
    p = project(db_session, status="completed")
    r = client.post("/api/donations/create-payment-session", json={
        "amount": 50, "name": "Sara", "email": "sara@example.com", "frequency": "One-Time",
        "fundraising_project_id": p.id})
    assert r.status_code == 409
    assert "session" not in stripe_capture


def test_an_abandoned_checkout_is_not_money_raised(client, db_session):
    p = project(db_session, spent_cents=0)
    db_session.add(Donation(name="X", email="x@example.com", amount=500, frequency="Abandoned",
                            fundraising_project_id=p.id))
    db_session.commit()
    assert raised(client, p.slug)["spent_amount"] == 0.0


def test_staff_can_record_cash_for_a_project_and_move_a_donation_between_projects(client, db_session, auth_headers):
    a = project(db_session, spent_cents=0)
    b = project(db_session, spent_cents=0, slug="school-books")
    r = client.post("/api/donations/manual", headers=auth_headers, data={
        "name": "Mosque collection", "email": "imam@example.com", "amount": "120", "payment_method": "Cash",
        "fundraising_project_id": str(a.id)})
    assert r.status_code == 201, r.text
    assert r.json()["fundraising_project_id"] == a.id
    assert raised(client, a.slug)["spent_amount"] == 120.0

    moved = client.put("/api/donations/%d" % r.json()["id"], headers=auth_headers, json={"fundraising_project_id": b.id})
    assert moved.status_code == 200
    assert raised(client, a.slug)["spent_amount"] == 0.0
    assert raised(client, b.slug)["spent_amount"] == 120.0
