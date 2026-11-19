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
