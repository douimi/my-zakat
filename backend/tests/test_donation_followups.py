"""A failed or abandoned donation says why, and the donor is offered help once."""
import json
from datetime import datetime, timedelta

import pytest

import donation_followups as fu
from marketing.renderer import render
from models import Donation, EmailOutbox


@pytest.fixture(autouse=True)
def _webhooks(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    import routers.donations as donations_module
    donations_module._processed_events.clear()
    # No Redis in tests: the outbox row is what we assert on. (Without arq
    # installed the mailer already skips the enqueue and leaves the row pending.)
    try:
        import marketing.queue
        monkeypatch.setattr(marketing.queue, "enqueue_send_job", lambda outbox_id: None)
    except ImportError:
        pass


def webhook(client, monkeypatch, event):
    monkeypatch.setattr("stripe.Webhook.construct_event", lambda payload, sig, secret: event)
    r = client.post("/api/donations/stripe-webhook", content=json.dumps(event),
                    headers={"stripe-signature": "t=1,v1=x", "content-type": "application/json"})
    assert r.status_code == 200, r.text


def declined(n, email="sara@example.com", reason="insufficient_funds", **extra):
    charge = {
        "id": "ch_%d" % n, "amount": 5000, "receipt_email": email,
        "billing_details": {"email": email, "name": "Sara Ahmed"},
        "failure_code": "card_declined", "failure_message": "Your card has insufficient funds.",
        "outcome": {"reason": reason, "network_status": "declined_by_network"},
        "payment_method_details": {"card": {"brand": "visa", "last4": "4242", "country": "US"}},
    }
    charge.update(extra)
    return {"id": "evt_ch_%d" % n, "type": "charge.failed", "data": {"object": charge}}


def later(hours=2):
    return datetime.utcnow() + timedelta(hours=hours)


def emails_to(db, email):
    return db.query(EmailOutbox).filter(EmailOutbox.to_email == email).all()


def test_a_declined_card_keeps_stripes_reason_and_staff_see_it_in_plain_english(
        client, db_session, monkeypatch, auth_headers):
    webhook(client, monkeypatch, declined(1))

    d = db_session.query(Donation).one()
    assert d.frequency == "Failed - card_declined"
    assert d.failure_code == "insufficient_funds"
    assert "Your card has insufficient funds." in d.failure_detail
    assert "Visa •••• 4242" in d.failure_detail
    assert d.followup_status == fu.SCHEDULED

    rows = client.get("/api/donations/", headers=auth_headers).json()
    row = next(r for r in rows if r["id"] == d.id)
    assert row["failure_explanation"] == "The card does not have enough funds."
    assert row["followup_status"] == "scheduled"


def test_the_donor_is_written_to_from_naser_an_hour_later_not_before(client, db_session, monkeypatch):
    webhook(client, monkeypatch, declined(1))

    assert fu.process_due_followups(db_session, now=datetime.utcnow())[fu.SENT] == 0
    assert emails_to(db_session, "sara@example.com") == []

    assert fu.process_due_followups(db_session, now=later())[fu.SENT] == 1
    [mail] = emails_to(db_session, "sara@example.com")
    assert mail.from_email == "nhdieb@myzakat.org" and mail.reply_to == "nhdieb@myzakat.org"
    assert mail.template_slug == "donation_followup" and mail.category == "transactional"
    for body in (mail.body_html, mail.body_text):
        assert "JazakAllahu khayran" in body
        assert "+1 (571) 243-0710" in body and "https://wa.me/15712430710" in body
        assert "nhdieb@myzakat.org" in body
        assert "$50.00" in body and "/donate" in body
        assert "Sara" in body
    d = db_session.query(Donation).one()
    assert d.followup_status == fu.SENT and d.followup_sent_at is not None


def test_no_email_when_the_donor_succeeded_with_another_card_meanwhile(client, db_session, monkeypatch):
    webhook(client, monkeypatch, declined(1))
    db_session.add(Donation(name="Sara Ahmed", email="SARA@example.com", amount=50, frequency="One-Time",
                            donated_at=datetime.utcnow() + timedelta(minutes=3)))
    db_session.commit()

    counts = fu.process_due_followups(db_session, now=later())
    assert counts[fu.NOT_NEEDED] == 1 and counts[fu.SENT] == 0
    assert emails_to(db_session, "sara@example.com") == []


def test_three_declines_in_a_row_make_one_email(client, db_session, monkeypatch):
    for n in (1, 2, 3):
        webhook(client, monkeypatch, declined(n))

    counts = fu.process_due_followups(db_session, now=later())
    assert counts == {fu.SENT: 1, fu.NOT_NEEDED: 0, fu.SKIPPED: 2}
    assert len(emails_to(db_session, "sara@example.com")) == 1


def test_an_abandoned_checkout_says_so_and_gets_the_email(client, db_session, monkeypatch):
    webhook(client, monkeypatch, {"id": "evt_exp", "type": "checkout.session.expired", "data": {"object": {
        "id": "cs_1", "amount_total": 10000, "customer_email": "omar@example.com",
        "customer_details": {"name": "Omar"}}}})

    d = db_session.query(Donation).one()
    assert d.frequency == "Abandoned" and d.failure_code == "checkout_expired"
    assert "left without paying" in d.failure_explanation
    fu.process_due_followups(db_session, now=later())
    [mail] = emails_to(db_session, "omar@example.com")
    assert "the payment page was closed before the payment was completed" in mail.body_text


def test_an_abandoned_checkout_records_the_declined_attempt_behind_it(client, db_session, monkeypatch):
    import stripe
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", staticmethod(lambda pid: {"last_payment_error": {
        "code": "card_declined", "decline_code": "do_not_honor", "message": "Your card was declined."}}))
    webhook(client, monkeypatch, {"id": "evt_exp", "type": "checkout.session.expired", "data": {"object": {
        "id": "cs_1", "amount_total": 10000, "customer_email": "omar@example.com", "payment_intent": "pi_1"}}})

    d = db_session.query(Donation).one()
    assert "Your card was declined." in d.failure_detail and "do_not_honor" in d.failure_detail
    assert "after a failed attempt" in d.failure_explanation


def test_a_gift_completed_while_the_session_was_still_open_counts(client, db_session, monkeypatch):
    db_session.add(Donation(name="Omar", email="omar@example.com", amount=100, frequency="One-Time",
                            donated_at=datetime.utcnow() - timedelta(hours=20)))
    db_session.commit()
    webhook(client, monkeypatch, {"id": "evt_exp", "type": "checkout.session.expired", "data": {"object": {
        "id": "cs_1", "amount_total": 10000, "customer_email": "omar@example.com"}}})

    assert fu.process_due_followups(db_session, now=later())[fu.NOT_NEEDED] == 1


def test_a_declined_subscription_renewal_gets_no_email(client, db_session, monkeypatch):
    webhook(client, monkeypatch, declined(1, invoice="in_7"))
    d = db_session.query(Donation).one()
    assert d.followup_status is None and d.failure_explanation


def test_old_failures_are_explained_but_never_emailed(client, db_session):
    db_session.add_all([
        Donation(name="A", email="a@example.com", amount=10, frequency="Failed - expired_card",
                 donated_at=datetime.utcnow() - timedelta(days=90)),
        Donation(name="B", email="b@example.com", amount=10, frequency="Abandoned",
                 donated_at=datetime.utcnow() - timedelta(days=90)),
    ])
    db_session.commit()

    a, b = db_session.query(Donation).order_by(Donation.id).all()
    assert a.failure_explanation == "The card has expired."
    assert "left without paying" in b.failure_explanation
    assert fu.process_due_followups(db_session, now=later()) == {fu.SENT: 0, fu.NOT_NEEDED: 0, fu.SKIPPED: 0}
    assert db_session.query(EmailOutbox).count() == 0


def test_a_successful_donation_has_no_failure_explanation():
    assert Donation(frequency="One-Time", amount=5).failure_explanation is None


@pytest.mark.parametrize("code", ["stolen_card", "lost_card", "fraudulent", "pickup_card", "highest_risk_level"])
def test_the_donor_is_never_told_a_card_was_flagged(code):
    assert fu.donor_reason(Donation(frequency="Failed - x", failure_code=code)) == \
        "the payment was declined by the card issuer"


def test_the_template_pair_renders_without_a_name():
    ctx = dict(first_name=None, amount_str="$5.00", date_str="November 19, 2026",
               reason="the card appears to have expired", donate_url="https://myzakat.org/donate",
               contact_email="nhdieb@myzakat.org", contact_phone="+1 (571) 243-0710",
               whatsapp_url="https://wa.me/15712430710", frontend_url="https://myzakat.org", subject="s")
    html, text = render("donation_followup", ctx)
    assert "barakatuh," in text and "السلام عليكم" in html


# ── Staff tools on the details screen ────────────────────────────────────────

def old_abandoned(db, email="safa@example.com", session="cs_live_old"):
    d = Donation(name="Safa", email=email, amount=325.5, frequency="Abandoned",
                 stripe_session_id=session, donated_at=datetime.utcnow() - timedelta(days=1))
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def fake_stripe(monkeypatch):
    import stripe
    monkeypatch.setattr(stripe, "api_key", "sk_test_fake")
    data = {"session": {}, "charges": [], "pi": {}}
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", staticmethod(lambda sid: data["session"]))
    monkeypatch.setattr(stripe.Charge, "list", staticmethod(lambda **kw: {"data": data["charges"]}))
    monkeypatch.setattr(stripe.Charge, "retrieve", staticmethod(lambda cid: data["charges"][0]))
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", staticmethod(lambda pid: data["pi"]))
    return data


def test_staff_see_that_the_donor_never_submitted_a_card(client, db_session, auth_headers, fake_stripe):
    d = old_abandoned(db_session)
    fake_stripe["session"] = {"id": "cs_live_old", "mode": "payment", "amount_total": 32550, "currency": "usd",
                              "created": 1763495576, "expires_at": 1763581976, "status": "expired",
                              "payment_intent": None, "metadata": {"purpose": "Zakat"}}

    r = client.get("/api/donations/%d/stripe-timeline" % d.id, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == "The donor left without ever submitting a card: no payment was attempted."
    assert body["attempted"] is False
    labels = [s["label"] for s in body["steps"]]
    assert labels[0] == "Donor opened the Stripe payment page for $325.50 (Zakat)"
    assert labels[-1] == "Stripe closed the payment page: it expired unpaid"
    assert body["steps"][0]["at"].endswith("Z")


def test_staff_see_each_declined_attempt_and_the_reason_is_kept(client, db_session, auth_headers, fake_stripe):
    d = old_abandoned(db_session)
    fake_stripe["session"] = {"id": "cs_live_old", "mode": "payment", "amount_total": 32550, "currency": "usd",
                              "created": 1763495576, "expires_at": 1763581976, "status": "expired",
                              "payment_intent": "pi_1", "metadata": {}}
    fake_stripe["charges"] = [
        {"id": "ch_2", "created": 1763495700, "status": "failed", "amount": 32550, "currency": "usd",
         "failure_code": "card_declined", "failure_message": "Your card was declined.",
         "outcome": {"reason": "do_not_honor", "network_status": "declined_by_network"},
         "payment_method_details": {"card": {"brand": "mastercard", "last4": "1111", "country": "FR"}}},
        {"id": "ch_1", "created": 1763495650, "status": "failed", "amount": 32550, "currency": "usd",
         "failure_code": "incorrect_cvc", "failure_message": "Your card's security code is incorrect.",
         "outcome": {}, "payment_method_details": {"card": {"brand": "visa", "last4": "4242"}}},
    ]

    body = client.get("/api/donations/%d/stripe-timeline" % d.id, headers=auth_headers).json()
    assert body["summary"] == "The donor tried to pay (2 attempts), was declined, then left."
    declined = [s for s in body["steps"] if s["tone"] == "danger"]
    assert declined[0]["label"] == "Payment attempt with Visa •••• 4242 was declined"
    assert "Mastercard •••• 1111 (FR)" in declined[1]["label"] and "do_not_honor" in declined[1]["detail"]

    db_session.refresh(d)
    assert "security code is incorrect" in d.failure_detail
    assert "after a failed attempt" in d.failure_explanation


def test_the_timeline_says_when_the_donor_gave_afterwards(client, db_session, auth_headers, fake_stripe):
    d = old_abandoned(db_session)
    db_session.add(Donation(name="Safa", email="safa@example.com", amount=325.5, frequency="One-Time",
                            donated_at=datetime.utcnow()))
    db_session.commit()
    fake_stripe["session"] = {"id": "cs_live_old", "mode": "payment", "amount_total": 32550,
                              "created": 1763495576, "status": "expired", "payment_intent": None}

    body = client.get("/api/donations/%d/stripe-timeline" % d.id, headers=auth_headers).json()
    assert body["steps"][-1]["tone"] == "success" and "$325.50" in body["steps"][-1]["label"]


def test_the_timeline_explains_when_stripe_cannot_be_asked(client, db_session, auth_headers, monkeypatch):
    import stripe
    monkeypatch.setattr(stripe, "api_key", None)
    d = old_abandoned(db_session)
    r = client.get("/api/donations/%d/stripe-timeline" % d.id, headers=auth_headers)
    assert r.status_code == 422 and "not configured" in r.json()["detail"]


def test_staff_can_send_the_help_email_by_hand_even_for_an_old_row(client, db_session, auth_headers):
    d = old_abandoned(db_session)
    r = client.post("/api/donations/%d/send-followup" % d.id, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["followup_status"] == "sent" and r.json()["followup_sent_at"]
    [mail] = emails_to(db_session, "safa@example.com")
    assert mail.from_email == "nhdieb@myzakat.org" and "$325.50" in mail.body_text

    # Each press is one more email, never a silent no-op.
    assert client.post("/api/donations/%d/send-followup" % d.id, headers=auth_headers).status_code == 200
    assert len(emails_to(db_session, "safa@example.com")) == 2


def test_sending_by_hand_asks_first_when_the_donor_already_gave(client, db_session, auth_headers):
    d = old_abandoned(db_session)
    db_session.add(Donation(name="Safa", email="safa@example.com", amount=100, frequency="One-Time",
                            donated_at=datetime.utcnow()))
    db_session.commit()

    r = client.post("/api/donations/%d/send-followup" % d.id, headers=auth_headers)
    assert r.status_code == 409 and "already completed a donation of $100.00" in r.json()["detail"]
    assert emails_to(db_session, "safa@example.com") == []
    assert client.post("/api/donations/%d/send-followup?force=true" % d.id, headers=auth_headers).status_code == 200


def test_a_successful_donation_cannot_get_the_help_email(client, db_session, auth_headers):
    ok = Donation(name="Safa", email="safa@example.com", amount=10, frequency="One-Time")
    db_session.add(ok)
    db_session.commit()
    r = client.post("/api/donations/%d/send-followup" % ok.id, headers=auth_headers)
    assert r.status_code == 400
    assert client.post("/api/donations/%d/send-followup" % ok.id).status_code in (401, 403)
