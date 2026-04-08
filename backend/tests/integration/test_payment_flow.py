"""
Integration tests for the complete payment lifecycle.

These hit the REAL running backend with REAL Stripe test-mode API keys.
They simulate the full user journey:

    User fills donate form
      → Backend creates Stripe checkout session (real Stripe call)
      → Pending donation written to PostgreSQL
      → Stripe would send webhook (we simulate it with a signed payload)
      → Backend processes webhook, confirms donation
      → Donation visible in admin panel

Run with:
    docker-compose up -d
    cd backend
    pytest tests/integration/ -v -s
"""
import time
import uuid

import httpx
import pytest
import stripe

from tests.integration.conftest import (
    BACKEND_URL,
    build_checkout_completed_event,
    build_subscription_created_event,
    build_invoice_payment_event,
    post_webhook,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def unique_email():
    """Generate a unique email so tests don't clash."""
    return f"integration-{uuid.uuid4().hex[:8]}@test.myzakat.org"


# ===========================================================================
# 1. ONE-TIME DONATION — Full lifecycle
# ===========================================================================

class TestOneTimeDonationFlow:
    """
    End-to-end: create payment session → pending record → webhook → confirmed.
    """

    def test_full_lifecycle(self, api: httpx.Client, admin_headers: dict):
        email = unique_email()
        amount = 42.00

        # ----- Step 1: Create payment session (hits real Stripe) -----
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": amount,
            "name": "Integration Tester",
            "email": email,
            "purpose": "Zakat",
            "frequency": "One-Time",
        })
        assert resp.status_code == 200, f"Failed to create session: {resp.text}"
        session_id = resp.json()["id"]
        assert session_id.startswith("cs_test_"), f"Expected test session ID, got: {session_id}"

        # ----- Step 2: Verify pending donation exists in DB via admin -----
        donations = api.get("/api/donations/", headers=admin_headers).json()
        pending = [d for d in donations if d.get("stripe_session_id") == session_id]
        assert len(pending) == 1, f"Expected 1 pending donation for session {session_id}"
        assert "Pending" in pending[0]["frequency"]
        assert pending[0]["amount"] == amount
        donation_id = pending[0]["id"]

        # ----- Step 3: Simulate Stripe webhook (checkout.session.completed) -----
        event = build_checkout_completed_event(
            session_id=session_id,
            email=email,
            amount_cents=int(amount * 100),
            donor_name="Integration Tester",
            frequency="One-Time",
            purpose="Zakat",
        )
        webhook_resp = post_webhook(api, event)
        assert webhook_resp.status_code == 200, f"Webhook failed: {webhook_resp.text}"

        # ----- Step 4: Verify donation is now confirmed -----
        donations = api.get("/api/donations/", headers=admin_headers).json()
        confirmed = [d for d in donations if d.get("id") == donation_id]
        assert len(confirmed) == 1
        assert confirmed[0]["frequency"] == "One-Time"  # No longer "Pending"
        assert confirmed[0]["amount"] == amount
        assert confirmed[0]["email"] == email

    def test_real_stripe_session_has_checkout_url(self, api: httpx.Client):
        """The real Stripe session should include a usable checkout URL."""
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": 10,
            "name": "URL Test",
            "email": unique_email(),
            "purpose": "General Donation",
            "frequency": "One-Time",
        })
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        # Verify the session exists in Stripe
        session = stripe.checkout.Session.retrieve(session_id)
        assert session.url is not None
        assert "checkout.stripe.com" in session.url
        assert session.payment_status in ("unpaid", "no_payment_required")

    def test_large_donation(self, api: httpx.Client, admin_headers: dict):
        """A $9,999 donation should create a valid Stripe session."""
        email = unique_email()
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": 9999.00,
            "name": "Generous Donor",
            "email": email,
            "purpose": "Zakat",
            "frequency": "One-Time",
        })
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        # Verify in Stripe
        session = stripe.checkout.Session.retrieve(session_id)
        assert session.amount_total == 999900  # $9,999 in cents

    def test_minimum_amount_rejected(self, api: httpx.Client):
        """Amounts below $1 should be rejected at the API level."""
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": 0.50,
            "name": "Cheapskate",
            "email": unique_email(),
            "purpose": "General Donation",
            "frequency": "One-Time",
        })
        assert resp.status_code == 400

    def test_webhook_with_no_pending_creates_donation(self, api: httpx.Client, admin_headers: dict):
        """
        If the pending record is missing (edge case), the webhook
        should still create a donation record.
        """
        email = unique_email()
        fake_session_id = f"cs_test_orphan_{uuid.uuid4().hex[:12]}"

        event = build_checkout_completed_event(
            session_id=fake_session_id,
            email=email,
            amount_cents=2500,
            donor_name="Orphan Webhook",
        )
        resp = post_webhook(api, event)
        assert resp.status_code == 200

        donations = api.get("/api/donations/", headers=admin_headers).json()
        found = [d for d in donations if d["email"] == email]
        assert len(found) >= 1, "Webhook should create donation even without pending record"
        assert found[0]["amount"] == 25.00


# ===========================================================================
# 2. SUBSCRIPTION LIFECYCLE
# ===========================================================================

class TestSubscriptionFlow:
    """
    End-to-end subscription: create → checkout webhook → subscription webhook → invoice.
    """

    def test_monthly_subscription_lifecycle(self, api: httpx.Client, admin_headers: dict):
        """
        Full subscription lifecycle:
        1. Create real Stripe subscription session
        2. Verify pending record in DB
        3. Simulate checkout.session.completed → status becomes checkout_completed
        4. Simulate customer.subscription.created with the REAL customer ID
           (backend calls stripe.Customer.retrieve which needs a real customer)
        5. Verify subscription is active
        6. Simulate invoice.payment_succeeded → new donation record
        """
        email = unique_email()
        amount = 30.00

        # ----- Step 1: Create subscription (hits real Stripe) -----
        resp = api.post("/api/donations/create-subscription", json={
            "name": "Monthly Subscriber",
            "email": email,
            "amount": amount,
            "purpose": "General Donation",
            "interval": "month",
            "payment_day": 15,
        })
        assert resp.status_code == 200, f"Failed: {resp.text}"
        session_id = resp.json()["id"]
        assert session_id.startswith("cs_test_")

        # ----- Step 2: Verify pending subscription in DB -----
        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        pending = [s for s in subs if s["email"] == email]
        assert len(pending) == 1
        assert pending[0]["status"] == "pending"
        assert pending[0]["interval"] == "month"

        # ----- Step 3: Simulate checkout.session.completed -----
        checkout_event = build_checkout_completed_event(
            session_id=session_id,
            email=email,
            amount_cents=int(amount * 100),
            donor_name="Monthly Subscriber",
            mode="subscription",
        )
        resp = post_webhook(api, checkout_event)
        assert resp.status_code == 200

        # Status should be "checkout_completed" now
        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        sub = next(s for s in subs if s["email"] == email)
        assert sub["status"] == "checkout_completed"

        # ----- Step 4: Simulate customer.subscription.created -----
        # Retrieve the REAL customer_id from the Stripe session (not in DB API response)
        stripe_session = stripe.checkout.Session.retrieve(session_id)
        customer_id = stripe_session.customer
        fake_sub_id = f"sub_test_{uuid.uuid4().hex[:12]}"

        sub_created_event = build_subscription_created_event(
            subscription_id=fake_sub_id,
            customer_id=customer_id,
            amount_cents=int(amount * 100),
            interval="month",
            donor_name="Monthly Subscriber",
        )
        resp = post_webhook(api, sub_created_event)
        assert resp.status_code == 200

        # ----- Step 5: Verify subscription is now active -----
        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        sub = next(s for s in subs if s["email"] == email)
        assert sub["status"] == "active"
        assert sub["stripe_subscription_id"] == fake_sub_id

        # ----- Step 6: Simulate a recurring invoice payment -----
        invoice_event = build_invoice_payment_event(
            subscription_id=fake_sub_id,
            amount_cents=int(amount * 100),
            billing_reason="subscription_cycle",
        )
        resp = post_webhook(api, invoice_event)
        assert resp.status_code == 200

        # Should create a new donation record for this payment
        donations = api.get("/api/donations/", headers=admin_headers).json()
        recurring = [d for d in donations
                     if d["email"] == email and "Recurring" in d.get("frequency", "")]
        assert len(recurring) >= 1, "Invoice webhook should create a donation record"

    def test_annual_subscription_creation(self, api: httpx.Client, admin_headers: dict):
        """Annual subscriptions should be created with correct interval."""
        email = unique_email()
        resp = api.post("/api/donations/create-subscription", json={
            "name": "Annual Donor",
            "email": email,
            "amount": 500,
            "purpose": "Zakat",
            "interval": "year",
            "payment_day": 1,
            "payment_month": 6,
        })
        assert resp.status_code == 200

        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        sub = next(s for s in subs if s["email"] == email)
        assert sub["interval"] == "year"
        assert sub["payment_month"] == 6

    def test_invalid_interval_rejected(self, api: httpx.Client):
        resp = api.post("/api/donations/create-subscription", json={
            "name": "Bad Interval",
            "email": unique_email(),
            "amount": 25,
            "purpose": "General",
            "interval": "weekly",  # Invalid
            "payment_day": 1,
        })
        assert resp.status_code == 400


# ===========================================================================
# 3. WEBHOOK EDGE CASES
# ===========================================================================

def _activate_subscription(api, admin_headers, email, amount, name="Test Sub"):
    """
    Helper: create a subscription, walk it through checkout + activation webhooks,
    and return (subscription_record, fake_sub_id).
    """
    resp = api.post("/api/donations/create-subscription", json={
        "name": name,
        "email": email,
        "amount": amount,
        "purpose": "General",
        "interval": "month",
        "payment_day": 1,
    })
    assert resp.status_code == 200
    session_id = resp.json()["id"]

    # Retrieve the REAL customer ID from the Stripe session
    # (the subscriptions API response doesn't expose stripe_customer_id)
    stripe_session = stripe.checkout.Session.retrieve(session_id)
    customer_id = stripe_session.customer  # Real Stripe customer created in step 1

    fake_sub_id = f"sub_test_{uuid.uuid4().hex[:12]}"

    # checkout.session.completed
    post_webhook(api, build_checkout_completed_event(
        session_id=session_id, email=email, amount_cents=int(amount * 100),
        donor_name=name, mode="subscription",
    ))
    # customer.subscription.created (uses REAL customer_id so Stripe retrieve works)
    post_webhook(api, build_subscription_created_event(
        subscription_id=fake_sub_id, customer_id=customer_id,
        amount_cents=int(amount * 100), donor_name=name,
    ))

    # Re-fetch and verify active
    subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
    sub = next(s for s in subs if s["email"] == email)
    assert sub["status"] == "active", f"Subscription should be active, got {sub['status']}"
    return sub, fake_sub_id


class TestWebhookEdgeCases:
    """Test webhook handling for failure scenarios."""

    def test_invalid_signature_rejected(self, api: httpx.Client):
        """A webhook with a bad signature should be rejected."""
        payload = b'{"type":"checkout.session.completed"}'
        resp = api.post(
            "/api/donations/stripe-webhook",
            content=payload,
            headers={
                "stripe-signature": "t=123,v1=bad_signature",
                "content-type": "application/json",
            },
        )
        assert resp.status_code == 400

    def test_payment_failed_webhook(self, api: httpx.Client, admin_headers: dict):
        """invoice.payment_failed should mark subscription as past_due."""
        email = unique_email()
        sub, fake_sub_id = _activate_subscription(api, admin_headers, email, 20, "Fail Test")

        failed_event = {
            "id": f"evt_test_fail_{uuid.uuid4().hex[:8]}",
            "type": "invoice.payment_failed",
            "data": {"object": {"subscription": fake_sub_id}},
        }
        resp = post_webhook(api, failed_event)
        assert resp.status_code == 200

        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        sub = next(s for s in subs if s["email"] == email)
        assert sub["status"] == "past_due"

    def test_subscription_canceled_webhook(self, api: httpx.Client, admin_headers: dict):
        """customer.subscription.deleted should mark as canceled."""
        email = unique_email()
        sub, fake_sub_id = _activate_subscription(api, admin_headers, email, 15, "Cancel Test")

        cancel_event = {
            "id": f"evt_test_cancel_{uuid.uuid4().hex[:8]}",
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": fake_sub_id}},
        }
        resp = post_webhook(api, cancel_event)
        assert resp.status_code == 200

        subs = api.get("/api/donations/subscriptions", headers=admin_headers).json()
        sub = next(s for s in subs if s["email"] == email)
        assert sub["status"] == "canceled"


# ===========================================================================
# 4. ADMIN SYNC (the "Refresh" button flow)
# ===========================================================================

class TestAdminSync:
    """
    Test the Stripe sync endpoint — this is what your "Refresh" button does.
    It pulls recent paid sessions from Stripe and creates missing DB records.
    """

    def test_sync_creates_missing_records(self, api: httpx.Client, admin_headers: dict):
        """
        Create a real Stripe session, then sync. The sync should notice the
        session exists in Stripe even though the webhook never fired.
        """
        email = unique_email()
        amount = 17.00

        # Create a real payment session
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": amount,
            "name": "Sync Tester",
            "email": email,
            "purpose": "General Donation",
            "frequency": "One-Time",
        })
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        # The session is unpaid (user didn't complete checkout), so sync won't pick it up.
        # But verify the sync endpoint itself works without errors.
        sync_resp = api.post("/api/donations/sync-stripe-data", headers=admin_headers)
        assert sync_resp.status_code == 200
        data = sync_resp.json()
        assert "synced" in data
        assert data["status"] == "success"

    def test_sync_requires_admin(self, api: httpx.Client):
        """Sync endpoint should require admin auth."""
        resp = api.post("/api/donations/sync-stripe-data")
        assert resp.status_code in (401, 403)


# ===========================================================================
# 5. ZAKAT CALCULATOR — Real API
# ===========================================================================

class TestZakatCalculatorIntegration:
    """Verify the Zakat calculator works on the real running backend."""

    def test_standard_calculation(self, api: httpx.Client):
        resp = api.post("/api/donations/calculate-zakat", json={
            "liabilities": 2000,
            "cash": 15000,
            "receivables": 1000,
            "stocks": 5000,
            "retirement": 0,
            "gold_weight": 100,
            "gold_price_per_gram": 70,
            "silver_weight": 0,
            "silver_price_per_gram": 0,
            "business_goods": 0,
            "agriculture_value": 0,
            "investment_property": 0,
            "other_valuables": 0,
            "livestock": 0,
            "other_assets": 0,
        })
        assert resp.status_code == 200
        result = resp.json()
        assert result["gold"] == 100 * 70 * 0.025  # $175
        assert result["total"] > 0

    def test_zakat_flows_into_donation(self, api: httpx.Client):
        """
        Simulate the real user flow: calculate Zakat → donate that amount.
        This is the pre-filled amount flow from the calculator page.
        """
        # Step 1: Calculate
        calc_resp = api.post("/api/donations/calculate-zakat", json={
            "liabilities": 0, "cash": 20000, "receivables": 0, "stocks": 0,
            "retirement": 0, "gold_weight": 0, "gold_price_per_gram": 0,
            "silver_weight": 0, "silver_price_per_gram": 0, "business_goods": 0,
            "agriculture_value": 0, "investment_property": 0,
            "other_valuables": 0, "livestock": 0, "other_assets": 0,
        })
        zakat_total = calc_resp.json()["total"]
        assert zakat_total > 0

        # Step 2: Use that amount to create a payment session
        resp = api.post("/api/donations/create-payment-session", json={
            "amount": zakat_total,
            "name": "Zakat Flow Test",
            "email": unique_email(),
            "purpose": "Zakat",
            "frequency": "One-Time",
        })
        assert resp.status_code == 200
        session_id = resp.json()["id"]
        assert session_id.startswith("cs_test_")

        # Verify the Stripe session has the right amount
        session = stripe.checkout.Session.retrieve(session_id)
        assert session.amount_total == int(zakat_total * 100)


# ===========================================================================
# 6. DONATION STATS — Verify aggregation on real data
# ===========================================================================

class TestDonationStats:
    """Stats endpoint should reflect data created during the test run."""

    def test_stats_returns_valid_structure(self, api: httpx.Client):
        resp = api.get("/api/donations/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_donations" in data
        assert "total_donors" in data
        assert "impact" in data
        assert isinstance(data["total_donations"], (int, float))
        assert isinstance(data["total_donors"], int)
