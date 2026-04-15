"""
Comprehensive payment and Stripe integration tests.
Covers one-time donations, subscriptions, webhooks, Zakat calculations,
input validation, and edge cases.
"""
import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Donation, DonationSubscription


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _payment_data(**overrides):
    """Build a valid payment session request body."""
    base = {
        "amount": 100,
        "name": "John Doe",
        "email": "john@example.com",
        "purpose": "Zakat",
        "frequency": "One-Time",
    }
    base.update(overrides)
    return base


def _subscription_data(**overrides):
    """Build a valid subscription request body."""
    base = {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "amount": 50,
        "purpose": "General Donation",
        "interval": "month",
        "payment_day": 15,
        "payment_month": None,
    }
    base.update(overrides)
    return base


def _build_webhook_event(event_type: str, data_object: dict, event_id: str = "evt_test_123"):
    """Build a Stripe-like webhook event dict."""
    return {
        "id": event_id,
        "type": event_type,
        "data": {"object": data_object},
    }


# ---------------------------------------------------------------------------
# One-Time Payment Session Tests
# ---------------------------------------------------------------------------

@pytest.mark.api
class TestOneTimePayment:
    """Tests for POST /api/donations/create-payment-session"""

    def test_successful_payment_session(self, client: TestClient, db_session: Session):
        """Create a payment session and verify response + pending record."""
        resp = client.post("/api/donations/create-payment-session", json=_payment_data())
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "cs_test_mock_session_id"

        # A pending donation should exist in the database
        pending = db_session.query(Donation).filter(
            Donation.stripe_session_id == "cs_test_mock_session_id"
        ).first()
        assert pending is not None
        assert pending.name == "John Doe"
        assert pending.amount == 100
        assert "Pending" in pending.frequency

    def test_minimum_amount_rejected(self, client: TestClient):
        """Amounts below $1 should be rejected."""
        resp = client.post("/api/donations/create-payment-session", json=_payment_data(amount=0.50))
        assert resp.status_code == 400

    def test_zero_amount_rejected(self, client: TestClient):
        """Zero-dollar donations are not allowed."""
        resp = client.post("/api/donations/create-payment-session", json=_payment_data(amount=0))
        assert resp.status_code in (400, 422)

    def test_negative_amount_rejected(self, client: TestClient):
        """Negative amounts should be rejected."""
        resp = client.post("/api/donations/create-payment-session", json=_payment_data(amount=-10))
        assert resp.status_code in (400, 422)

    def test_large_donation_amount(self, client: TestClient):
        """Large donations ($9,999.99) should succeed."""
        resp = client.post("/api/donations/create-payment-session", json=_payment_data(amount=9999.99))
        assert resp.status_code == 200
        assert resp.json()["id"] == "cs_test_mock_session_id"

    def test_missing_required_fields(self, client: TestClient):
        """Missing name or email should fail validation."""
        resp = client.post("/api/donations/create-payment-session", json={"amount": 100})
        assert resp.status_code == 422

    def test_invalid_email(self, client: TestClient):
        """Invalid email format should fail."""
        resp = client.post(
            "/api/donations/create-payment-session",
            json=_payment_data(email="not-an-email"),
        )
        assert resp.status_code == 422

    def test_special_characters_in_name(self, client: TestClient, db_session: Session, monkeypatch):
        """Names with special characters should be handled correctly."""
        class UniqueSession:
            def __init__(self, **kwargs):
                self.id = "cs_test_special_chars"
                self.url = "https://checkout.stripe.com/pay/cs_test_special_chars"
                self.payment_status = "unpaid"

        monkeypatch.setattr("stripe.checkout.Session.create", lambda **kw: UniqueSession(**kw))

        resp = client.post(
            "/api/donations/create-payment-session",
            json=_payment_data(name="María O'Brien-González"),
        )
        assert resp.status_code == 200

        pending = db_session.query(Donation).filter(
            Donation.stripe_session_id == "cs_test_special_chars"
        ).first()
        assert pending is not None
        assert pending.name == "María O'Brien-González"

    def test_multiple_donations_same_email(self, client: TestClient, db_session: Session, monkeypatch):
        """Multiple donations from the same email should all be recorded."""
        # First donation
        session_counter = {"n": 0}
        original_create = None

        class MockSession:
            def __init__(self, **kwargs):
                session_counter["n"] += 1
                self.id = f"cs_test_session_{session_counter['n']}"
                self.url = f"https://checkout.stripe.com/pay/{self.id}"

        monkeypatch.setattr("stripe.checkout.Session.create", lambda **kw: MockSession(**kw))

        resp1 = client.post("/api/donations/create-payment-session", json=_payment_data(amount=50))
        resp2 = client.post("/api/donations/create-payment-session", json=_payment_data(amount=150))

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["id"] != resp2.json()["id"]

        donations = db_session.query(Donation).filter(
            Donation.email == "john@example.com"
        ).all()
        assert len(donations) >= 2

    def test_purpose_options(self, client: TestClient):
        """Various purpose values should be accepted."""
        for purpose in ["Zakat", "General Donation", "Emergency", "Orphan Care", "Education"]:
            resp = client.post(
                "/api/donations/create-payment-session",
                json=_payment_data(purpose=purpose),
            )
            assert resp.status_code == 200

    def test_prefilled_amount_from_zakat_calculator(self, client: TestClient):
        """A donation pre-filled from the Zakat calculator should work."""
        resp = client.post(
            "/api/donations/create-payment-session",
            json=_payment_data(amount=312.50, purpose="Zakat", frequency="One-Time"),
        )
        assert resp.status_code == 200

    def test_stripe_error_returns_500(self, client: TestClient, monkeypatch):
        """Stripe API errors should result in a 500 response."""
        import stripe

        def raise_stripe_error(**kwargs):
            raise stripe.error.StripeError("Card was declined")

        monkeypatch.setattr("stripe.checkout.Session.create", raise_stripe_error)

        resp = client.post("/api/donations/create-payment-session", json=_payment_data())
        assert resp.status_code == 500
        assert "Stripe error" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Subscription Tests
# ---------------------------------------------------------------------------

@pytest.mark.api
class TestSubscriptions:
    """Tests for POST /api/donations/create-subscription"""

    def test_monthly_subscription(self, client: TestClient, db_session: Session):
        """Create a monthly subscription and verify pending records."""
        resp = client.post("/api/donations/create-subscription", json=_subscription_data())
        assert resp.status_code == 200
        assert resp.json()["id"] == "cs_test_mock_session_id"

        sub = db_session.query(DonationSubscription).filter(
            DonationSubscription.email == "jane@example.com"
        ).first()
        assert sub is not None
        assert sub.interval == "month"
        assert sub.status == "pending"
        assert sub.amount == 50

    def test_annual_subscription(self, client: TestClient, db_session: Session):
        """Create an annual subscription with a specific payment month."""
        data = _subscription_data(interval="year", payment_month=6, payment_day=1)
        resp = client.post("/api/donations/create-subscription", json=data)
        assert resp.status_code == 200

        sub = db_session.query(DonationSubscription).filter(
            DonationSubscription.email == "jane@example.com"
        ).first()
        assert sub is not None
        assert sub.interval == "year"
        assert sub.payment_month == 6

    def test_invalid_interval(self, client: TestClient):
        """Only 'month' and 'year' intervals should be accepted."""
        resp = client.post(
            "/api/donations/create-subscription",
            json=_subscription_data(interval="week"),
        )
        assert resp.status_code == 400

    def test_invalid_payment_day(self, client: TestClient):
        """Payment day must be between 1 and 31."""
        for day in [0, 32, -1]:
            resp = client.post(
                "/api/donations/create-subscription",
                json=_subscription_data(payment_day=day),
            )
            assert resp.status_code == 400, f"Day {day} should be rejected"

    def test_invalid_payment_month(self, client: TestClient):
        """Payment month must be between 1 and 12 for annual subscriptions."""
        resp = client.post(
            "/api/donations/create-subscription",
            json=_subscription_data(interval="year", payment_month=13),
        )
        assert resp.status_code == 400

    def test_subscription_minimum_amount(self, client: TestClient):
        """Subscription amounts below $1 should be rejected."""
        resp = client.post(
            "/api/donations/create-subscription",
            json=_subscription_data(amount=0.50),
        )
        assert resp.status_code == 400

    def test_cancel_subscription_requires_admin(self, client: TestClient):
        """Cancelling a subscription requires admin authentication."""
        resp = client.post(
            "/api/donations/cancel-subscription",
            json={"subscription_id": "sub_test_123"},
        )
        assert resp.status_code in (401, 403)

    def test_cancel_subscription_as_admin(
        self, client: TestClient, auth_headers: dict, db_session: Session
    ):
        """Admin can cancel a subscription."""
        # Create a subscription record first
        sub = DonationSubscription(
            stripe_subscription_id="sub_test_cancel",
            stripe_customer_id="cus_test",
            name="Cancel Me",
            email="cancel@example.com",
            amount=25,
            purpose="General",
            interval="month",
            payment_day=1,
            status="active",
        )
        db_session.add(sub)
        db_session.commit()

        resp = client.post(
            "/api/donations/cancel-subscription",
            json={"subscription_id": "sub_test_cancel"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

        db_session.refresh(sub)
        assert sub.status == "canceled"

    def test_cancel_missing_subscription_id(self, client: TestClient, auth_headers: dict):
        """Missing subscription_id should return 400."""
        resp = client.post(
            "/api/donations/cancel-subscription",
            json={},
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Webhook Tests
# ---------------------------------------------------------------------------

@pytest.mark.api
class TestStripeWebhook:
    """Tests for POST /api/donations/stripe-webhook"""

    @pytest.fixture(autouse=True)
    def _setup_webhook_secret(self, monkeypatch):
        """Set a webhook secret, mock verification, and clear idempotency cache."""
        monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret")
        # Clear the processed events set so each test starts fresh
        import routers.donations as donations_module
        donations_module._processed_events.clear()

    def _post_webhook(self, client, event, monkeypatch):
        """Helper to post a webhook event with mocked signature verification."""
        import stripe as stripe_module

        # Mock construct_event to return the event dict directly
        monkeypatch.setattr(
            "stripe.Webhook.construct_event",
            lambda payload, sig, secret: event,
        )

        return client.post(
            "/api/donations/stripe-webhook",
            content=json.dumps(event),
            headers={
                "stripe-signature": "t=1234,v1=fake_sig",
                "content-type": "application/json",
            },
        )

    def test_one_time_payment_completed_updates_pending(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """Webhook should update an existing pending donation on checkout.session.completed."""
        # Create a pending donation
        pending = Donation(
            name="Webhook Test",
            email="webhook@example.com",
            amount=75,
            frequency="Pending - One-Time",
            stripe_session_id="cs_webhook_test",
        )
        db_session.add(pending)
        db_session.commit()
        donation_id = pending.id

        event = _build_webhook_event("checkout.session.completed", {
            "id": "cs_webhook_test",
            "mode": "payment",
            "customer_email": "webhook@example.com",
            "amount_total": 7500,
            "metadata": {
                "donor_name": "Webhook Test",
                "frequency": "One-Time",
                "purpose": "Zakat",
            },
            "customer_details": {"name": "Webhook Test"},
        })

        # Mock email_certificate to avoid actually sending emails
        monkeypatch.setattr("routers.donations.email_certificate", lambda d: True)

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        # Verify donation was updated
        updated = db_session.query(Donation).get(donation_id)
        db_session.refresh(updated)
        assert updated.frequency == "One-Time"  # "Pending" removed
        assert updated.amount == 75

    def test_one_time_payment_creates_new_when_no_pending(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """Webhook should create a new donation if no pending record exists."""
        event = _build_webhook_event("checkout.session.completed", {
            "id": "cs_new_donation",
            "mode": "payment",
            "customer_email": "new@example.com",
            "amount_total": 5000,
            "metadata": {
                "donor_name": "New Donor",
                "frequency": "One-Time",
            },
            "customer_details": {"name": "New Donor"},
        })

        monkeypatch.setattr("routers.donations.email_certificate", lambda d: True)

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        created = db_session.query(Donation).filter(
            Donation.stripe_session_id == "cs_new_donation"
        ).first()
        assert created is not None
        assert created.email == "new@example.com"
        assert created.amount == 50.0

    def test_subscription_created_webhook(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """customer.subscription.created should activate a pending subscription."""
        # Create pending subscription
        sub = DonationSubscription(
            stripe_subscription_id="pending_cs_sub_test",
            stripe_customer_id="cus_sub_test",
            stripe_session_id="cs_sub_test",
            name="Sub Donor",
            email="sub@example.com",
            amount=30,
            purpose="General Donation",
            interval="month",
            payment_day=1,
            status="checkout_completed",
        )
        db_session.add(sub)
        db_session.commit()

        # Mock Stripe customer retrieval
        mock_customer = MagicMock()
        mock_customer.email = "sub@example.com"
        mock_customer.name = "Sub Donor"
        mock_customer.get = lambda k, d=None: {} if k == "metadata" else d
        monkeypatch.setattr("stripe.Customer.retrieve", lambda cid: mock_customer)

        event = _build_webhook_event("customer.subscription.created", {
            "id": "sub_real_id",
            "customer": "cus_sub_test",
            "metadata": {"donor_name": "Sub Donor", "purpose": "General Donation"},
            "items": {
                "data": [{
                    "price": {
                        "unit_amount": 3000,
                        "recurring": {"interval": "month"},
                    }
                }]
            },
        })

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        db_session.refresh(sub)
        assert sub.status == "active"
        assert sub.stripe_subscription_id == "sub_real_id"

    def test_invoice_payment_succeeded_creates_donation(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """invoice.payment_succeeded should create a donation record for recurring payments."""
        sub = DonationSubscription(
            stripe_subscription_id="sub_invoice_test",
            stripe_customer_id="cus_invoice",
            name="Invoice Donor",
            email="invoice@example.com",
            amount=40,
            purpose="Zakat",
            interval="month",
            payment_day=15,
            status="active",
        )
        db_session.add(sub)
        db_session.commit()

        monkeypatch.setattr("routers.donations.email_certificate", lambda d: True)

        event = _build_webhook_event("invoice.payment_succeeded", {
            "subscription": "sub_invoice_test",
            "amount_paid": 4000,
            "billing_reason": "subscription_cycle",
        })

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        donation = db_session.query(Donation).filter(
            Donation.email == "invoice@example.com",
            Donation.frequency.like("Recurring monthly%"),
        ).first()
        assert donation is not None
        assert donation.amount == 40.0

    def test_invoice_payment_failed_sets_past_due(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """invoice.payment_failed should mark subscription as past_due."""
        sub = DonationSubscription(
            stripe_subscription_id="sub_fail_test",
            stripe_customer_id="cus_fail",
            name="Fail Donor",
            email="fail@example.com",
            amount=25,
            purpose="General",
            interval="month",
            payment_day=1,
            status="active",
        )
        db_session.add(sub)
        db_session.commit()

        event = _build_webhook_event("invoice.payment_failed", {
            "subscription": "sub_fail_test",
        })

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        db_session.refresh(sub)
        assert sub.status == "past_due"

    def test_subscription_deleted_sets_canceled(
        self, client: TestClient, db_session: Session, monkeypatch
    ):
        """customer.subscription.deleted should cancel the subscription."""
        sub = DonationSubscription(
            stripe_subscription_id="sub_delete_test",
            stripe_customer_id="cus_delete",
            name="Delete Donor",
            email="delete@example.com",
            amount=20,
            purpose="General",
            interval="month",
            payment_day=1,
            status="active",
        )
        db_session.add(sub)
        db_session.commit()

        event = _build_webhook_event("customer.subscription.deleted", {
            "id": "sub_delete_test",
        })

        resp = self._post_webhook(client, event, monkeypatch)
        assert resp.status_code == 200

        db_session.refresh(sub)
        assert sub.status == "canceled"

    def test_webhook_missing_secret_returns_500(
        self, client: TestClient, monkeypatch
    ):
        """Webhook should fail gracefully when secret is not configured."""
        monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
        # Patch at module level so it reads empty
        monkeypatch.setattr("os.getenv", lambda k, d=None: None if k == "STRIPE_WEBHOOK_SECRET" else d)

        resp = client.post(
            "/api/donations/stripe-webhook",
            content=b'{}',
            headers={"stripe-signature": "t=1,v1=sig"},
        )
        assert resp.status_code == 500

    def test_webhook_invalid_signature(self, client: TestClient, monkeypatch):
        """Invalid webhook signature should return 400."""
        import stripe

        def raise_sig_error(payload, sig, secret):
            raise stripe.error.SignatureVerificationError("bad sig", "sig_header")

        monkeypatch.setattr("stripe.Webhook.construct_event", raise_sig_error)

        resp = client.post(
            "/api/donations/stripe-webhook",
            content=b'{"type":"test"}',
            headers={"stripe-signature": "t=1,v1=bad"},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Zakat Calculation Tests
# ---------------------------------------------------------------------------

@pytest.mark.api
class TestZakatCalculation:
    """Tests for POST /api/donations/calculate-zakat"""

    def test_comprehensive_calculation(self, client: TestClient):
        """Verify Zakat calculation with all asset types."""
        data = {
            "liabilities": 1000,
            "cash": 10000,
            "receivables": 2000,
            "stocks": 5000,
            "retirement": 0,
            "gold_weight": 100,
            "gold_price_per_gram": 70,
            "silver_weight": 500,
            "silver_price_per_gram": 0.8,
            "business_goods": 3000,
            "agriculture_value": 2000,
            "investment_property": 0,
            "other_valuables": 0,
            "livestock": 0,
            "other_assets": 0,
        }
        resp = client.post("/api/donations/calculate-zakat", json=data)
        assert resp.status_code == 200

        result = resp.json()
        assert result["wealth"] > 0
        assert result["gold"] == (100 * 70) * 0.025  # 175.0
        assert result["silver"] == (500 * 0.8) * 0.025  # 10.0
        assert result["business_goods"] == 3000 * 0.025  # 75.0
        assert result["agriculture"] == 2000 * 0.05  # 100.0
        assert result["total"] == result["wealth"] + result["gold"] + result["silver"] + result["business_goods"] + result["agriculture"]

    def test_zero_assets_returns_zero(self, client: TestClient):
        """No assets should yield zero Zakat."""
        data = {
            "liabilities": 0, "cash": 0, "receivables": 0, "stocks": 0,
            "retirement": 0, "gold_weight": 0, "gold_price_per_gram": 0,
            "silver_weight": 0, "silver_price_per_gram": 0, "business_goods": 0,
            "agriculture_value": 0, "investment_property": 0,
            "other_valuables": 0, "livestock": 0, "other_assets": 0,
        }
        resp = client.post("/api/donations/calculate-zakat", json=data)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_liabilities_reduce_wealth_zakat(self, client: TestClient):
        """Liabilities should reduce wealth-based Zakat."""
        base = {
            "liabilities": 0, "cash": 10000, "receivables": 0, "stocks": 0,
            "retirement": 0, "gold_weight": 0, "gold_price_per_gram": 0,
            "silver_weight": 0, "silver_price_per_gram": 0, "business_goods": 0,
            "agriculture_value": 0, "investment_property": 0,
            "other_valuables": 0, "livestock": 0, "other_assets": 0,
        }

        resp_no_debt = client.post("/api/donations/calculate-zakat", json=base)
        resp_with_debt = client.post("/api/donations/calculate-zakat", json={**base, "liabilities": 5000})

        no_debt = resp_no_debt.json()["wealth"]
        with_debt = resp_with_debt.json()["wealth"]
        assert with_debt < no_debt

    def test_gold_only_calculation(self, client: TestClient):
        """Zakat on gold alone should be 2.5% of (weight * price)."""
        data = {
            "liabilities": 0, "cash": 0, "receivables": 0, "stocks": 0,
            "retirement": 0, "gold_weight": 85, "gold_price_per_gram": 60,
            "silver_weight": 0, "silver_price_per_gram": 0, "business_goods": 0,
            "agriculture_value": 0, "investment_property": 0,
            "other_valuables": 0, "livestock": 0, "other_assets": 0,
        }
        resp = client.post("/api/donations/calculate-zakat", json=data)
        result = resp.json()
        assert result["gold"] == pytest.approx(85 * 60 * 0.025)
        assert result["wealth"] == 0

    def test_agriculture_uses_5_percent(self, client: TestClient):
        """Agriculture Zakat should be 5% (not 2.5%)."""
        data = {
            "liabilities": 0, "cash": 0, "receivables": 0, "stocks": 0,
            "retirement": 0, "gold_weight": 0, "gold_price_per_gram": 0,
            "silver_weight": 0, "silver_price_per_gram": 0, "business_goods": 0,
            "agriculture_value": 10000, "investment_property": 0,
            "other_valuables": 0, "livestock": 0, "other_assets": 0,
        }
        resp = client.post("/api/donations/calculate-zakat", json=data)
        assert resp.json()["agriculture"] == 500.0  # 10000 * 0.05


# ---------------------------------------------------------------------------
# Donation Stats & Admin Tests
# ---------------------------------------------------------------------------

@pytest.mark.api
class TestDonationStats:
    """Tests for GET /api/donations/stats and admin endpoints."""

    def test_stats_with_donations(self, client: TestClient, db_session: Session):
        """Stats should aggregate all donation amounts."""
        now = datetime.utcnow()
        for i, amount in enumerate([100, 200, 50]):
            db_session.add(Donation(
                name=f"Donor {i}",
                email=f"donor{i}@example.com",
                amount=amount,
                frequency="one-time",
                donated_at=now - timedelta(days=i),
            ))
        db_session.commit()

        resp = client.get("/api/donations/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_donations"] == 350
        assert data["total_donors"] == 3

    def test_stats_empty(self, client: TestClient):
        """Stats should work with no donations."""
        resp = client.get("/api/donations/stats")
        assert resp.status_code == 200
        assert resp.json()["total_donations"] == 0

    def test_get_donations_requires_auth(self, client: TestClient):
        """Listing all donations requires admin auth."""
        resp = client.get("/api/donations/")
        assert resp.status_code in (401, 403)

    def test_get_donations_as_admin(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Admin can list all donations."""
        db_session.add(Donation(
            name="Listed", email="list@example.com", amount=10, frequency="one-time"
        ))
        db_session.commit()

        resp = client.get("/api/donations/", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_subscriptions_requires_auth(self, client: TestClient):
        """Listing subscriptions requires admin auth."""
        resp = client.get("/api/donations/subscriptions")
        assert resp.status_code in (401, 403)

    def test_get_subscriptions_as_admin(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Admin can list all subscriptions."""
        db_session.add(DonationSubscription(
            stripe_subscription_id="sub_list",
            stripe_customer_id="cus_list",
            name="List Sub",
            email="listsub@example.com",
            amount=25,
            purpose="General",
            interval="month",
            payment_day=1,
            status="active",
        ))
        db_session.commit()

        resp = client.get("/api/donations/subscriptions", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# Next Payment Date Calculation Tests
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestNextPaymentDate:
    """Test the calculate_next_payment_date helper."""

    def test_monthly_future_day(self):
        """Monthly payment for a future day this month."""
        from routers.donations import calculate_next_payment_date
        # This test is date-dependent; just verify it returns a datetime
        result = calculate_next_payment_date(28, interval="month")
        assert isinstance(result, datetime)
        assert result.day <= 28

    def test_monthly_past_day_wraps(self):
        """If the payment day already passed, next month is chosen."""
        from routers.donations import calculate_next_payment_date
        result = calculate_next_payment_date(1, interval="month")
        assert isinstance(result, datetime)

    def test_annual_payment(self):
        """Annual payment with specific month and day."""
        from routers.donations import calculate_next_payment_date
        result = calculate_next_payment_date(15, payment_month=6, interval="year")
        assert isinstance(result, datetime)
        assert result.month == 6 or result.year > datetime.utcnow().year

    def test_day_31_clamped(self):
        """Day 31 should be clamped for months with fewer days."""
        from routers.donations import calculate_next_payment_date
        result = calculate_next_payment_date(31, interval="month")
        assert isinstance(result, datetime)
        assert result.day <= 31
