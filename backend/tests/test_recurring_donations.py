"""Every charge of a recurring gift becomes a donation, whatever order Stripe sends things in."""
import json

import pytest

from models import Donation, DonationSubscription


@pytest.fixture(autouse=True)
def _webhooks(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    import routers.donations as donations_module
    donations_module._processed_events.clear()
    monkeypatch.setattr("routers.donations.email_certificate", lambda d: True)


@pytest.fixture
def stripe_subscription(monkeypatch):
    """What stripe.Subscription.retrieve returns for sub_live."""
    import stripe
    sub = {"id": "sub_live", "metadata": {"donor_name": "Omar Haddad", "purpose": "Zakat", "payment_day": "5"},
           "items": {"data": [{"price": {"unit_amount": 5000, "recurring": {"interval": "month"}}}]}}
    monkeypatch.setattr(stripe.Subscription, "retrieve", staticmethod(lambda sid, **kw: sub))
    return sub


def webhook(client, monkeypatch, event):
    monkeypatch.setattr("stripe.Webhook.construct_event", lambda payload, sig, secret: event)
    return client.post("/api/donations/stripe-webhook", content=json.dumps(event),
                       headers={"stripe-signature": "t=1,v1=x", "content-type": "application/json"})


def invoice(n=1, **over):
    body = {"id": "in_%d" % n, "amount_paid": 5000, "customer": "cus_1", "customer_email": "omar@example.com",
            "customer_name": "Omar Haddad", "subscription": "sub_live",
            "status_transitions": {"paid_at": 1767225600 + n * 2592000}}
    body.update(over)
    return body


def test_a_first_charge_arriving_before_the_subscription_is_still_recorded(
        client, db_session, monkeypatch, stripe_subscription):
    """The defect: the charge was dropped when its subscription record was missing."""
    webhook(client, monkeypatch, {"id": "evt_inv_1", "type": "invoice.payment_succeeded", "data": {"object": invoice()}})

    donation = db_session.query(Donation).filter_by(stripe_session_id="in_1").one()
    assert donation.amount == 50.0 and donation.frequency == "Recurring monthly"
    assert donation.name == "Omar Haddad" and donation.email == "omar@example.com"
    sub = db_session.query(DonationSubscription).filter_by(stripe_subscription_id="sub_live").one()
    assert sub.purpose == "Zakat" and sub.payment_day == 5


def test_the_subscription_event_arriving_second_does_not_duplicate_it(
        client, db_session, monkeypatch, stripe_subscription):
    import stripe
    webhook(client, monkeypatch, {"id": "evt_inv_1", "type": "invoice.payment_succeeded", "data": {"object": invoice()}})
    monkeypatch.setattr(stripe.Customer, "retrieve", staticmethod(
        lambda cid, **kw: {"id": cid, "email": "omar@example.com", "name": "Omar Haddad", "metadata": {}}))

    r = webhook(client, monkeypatch, {"id": "evt_sub_1", "type": "customer.subscription.created", "data": {"object": {
        "id": "sub_live", "customer": "cus_1", "metadata": {},
        "items": {"data": [{"price": {"unit_amount": 5000, "recurring": {"interval": "month"}}}]}}}})

    assert r.status_code == 200
    assert db_session.query(DonationSubscription).filter_by(stripe_subscription_id="sub_live").count() == 1
    assert db_session.query(Donation).count() == 1


def test_the_newer_stripe_invoice_shape_is_understood(client, db_session, monkeypatch, stripe_subscription):
    """Since API 2025-03-31 the subscription is under parent.subscription_details."""
    shaped = invoice(subscription=None, parent={"subscription_details": {"subscription": "sub_live", "metadata": {}}})
    webhook(client, monkeypatch, {"id": "evt_inv_2", "type": "invoice.payment_succeeded", "data": {"object": shaped}})
    assert db_session.query(Donation).filter_by(stripe_session_id="in_1").count() == 1


def test_a_retried_event_records_the_charge_once(client, db_session, monkeypatch, stripe_subscription):
    for evt in ("evt_a", "evt_b"):
        webhook(client, monkeypatch, {"id": evt, "type": "invoice.payment_succeeded", "data": {"object": invoice()}})
    assert db_session.query(Donation).count() == 1


def test_past_charges_can_be_imported_from_stripe_once(client, db_session, auth_headers, monkeypatch, stripe_subscription):
    import stripe

    class Page:
        def auto_paging_iter(self):
            for n in (1, 2, 3):
                yield type("Inv", (), {"to_dict": lambda self, n=n: invoice(n)})()

    monkeypatch.setattr(stripe, "api_key", "sk_test_fake")
    monkeypatch.setattr(stripe.Invoice, "list", staticmethod(lambda **kw: Page()))

    first = client.post("/api/donations/sync-recurring-payments", headers=auth_headers)
    again = client.post("/api/donations/sync-recurring-payments", headers=auth_headers)

    assert first.status_code == 200, first.text
    assert first.json()["imported"] == 3 and again.json()["imported"] == 0
    dates = sorted(d.donated_at for d in db_session.query(Donation).all())
    assert len(dates) == 3 and dates[0].year == 2026            # dated when Stripe charged, not today
    assert client.post("/api/donations/sync-recurring-payments").status_code in (401, 403)
