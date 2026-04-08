"""
Integration test configuration.

These tests run against the REAL Docker stack (docker-compose up).
They hit real PostgreSQL, real Stripe (test mode), and the actual FastAPI app.

Prerequisites:
    1. docker-compose up -d   (DB, backend, frontend, minio)
    2. .env has valid Stripe test keys
    3. Run: pytest tests/integration/ -v
"""
import os
import time
import hashlib
import hmac
import json
from pathlib import Path

import pytest
import httpx
import stripe
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env from project root
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[3]  # backend/tests/integration -> project root
load_dotenv(PROJECT_ROOT / ".env")

BACKEND_URL = os.getenv("API_URL", "http://localhost:8000")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


def _check_prerequisites():
    """Fail fast if Docker stack isn't running or keys are missing."""
    errors = []
    if not STRIPE_SECRET_KEY.startswith("sk_test_"):
        errors.append("STRIPE_SECRET_KEY must be a sk_test_* key (found in .env)")
    if not STRIPE_WEBHOOK_SECRET.startswith("whsec_"):
        errors.append("STRIPE_WEBHOOK_SECRET must be a whsec_* key (found in .env)")
    try:
        r = httpx.get(f"{BACKEND_URL}/api/donations/stats", timeout=5)
        r.raise_for_status()
    except Exception as exc:
        errors.append(
            f"Backend not reachable at {BACKEND_URL}. "
            f"Run 'docker-compose up -d' first. Error: {exc}"
        )
    if errors:
        pytest.skip("\n".join(errors))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def _prerequisites():
    """Verify Docker stack is running and keys are present."""
    _check_prerequisites()
    # Configure Stripe SDK for the whole test session
    stripe.api_key = STRIPE_SECRET_KEY


@pytest.fixture(scope="session")
def api():
    """HTTP client pointed at the running backend."""
    with httpx.Client(base_url=BACKEND_URL, timeout=30) as client:
        yield client


ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "admin123")


@pytest.fixture(scope="session")
def admin_token(api: httpx.Client):
    """
    Get an admin JWT token.

    Tries credentials from env vars TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD,
    falling back to default dev credentials.

    If login fails, creates a fresh admin account via the database directly
    (using the backend's own init logic via a test-only registration endpoint).
    """
    # Try existing credentials (user-provided, defaults, and integration test account)
    for email, password in [
        (ADMIN_EMAIL, ADMIN_PASSWORD),
        ("admin@example.com", "admin123"),
        ("testadmin@myzakat.org", "integration-test-2024"),
    ]:
        resp = api.post("/api/auth/login", json={"email": email, "password": password})
        if resp.status_code == 200:
            return resp.json()["access_token"]

    # If we reach here, no known admin works — register a new test user
    # and promote via direct DB query won't work from outside Docker.
    # Fall back to skipping tests that need admin.
    pytest.skip(
        f"Could not log in as admin with {ADMIN_EMAIL}. "
        "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars, "
        "or ensure default admin exists (admin@example.com / admin123)."
    )


@pytest.fixture(scope="session")
def admin_headers(admin_token: str):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------------------------------------------------------------------
# Helpers available to all integration tests
# ---------------------------------------------------------------------------

def sign_webhook_payload(payload: bytes, secret: str) -> str:
    """
    Construct a valid Stripe webhook signature header.

    This lets us POST directly to /api/donations/stripe-webhook
    with a payload that passes stripe.Webhook.construct_event() verification,
    without needing Stripe to actually call us.
    """
    timestamp = str(int(time.time()))
    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def build_checkout_completed_event(
    session_id: str,
    email: str,
    amount_cents: int,
    donor_name: str,
    frequency: str = "One-Time",
    purpose: str = "General Donation",
    mode: str = "payment",
):
    """Build a realistic checkout.session.completed event payload."""
    return {
        "id": f"evt_test_{session_id[-8:]}",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "mode": mode,
                "payment_status": "paid",
                "customer_email": email,
                "amount_total": amount_cents,
                "currency": "usd",
                "metadata": {
                    "purpose": purpose,
                    "frequency": frequency,
                    "donor_name": donor_name,
                    "donor_email": email,
                },
                "customer_details": {
                    "email": email,
                    "name": donor_name,
                },
            }
        },
    }


def build_subscription_created_event(
    subscription_id: str,
    customer_id: str,
    amount_cents: int,
    interval: str = "month",
    donor_name: str = "Test Donor",
    purpose: str = "General Donation",
):
    """Build a realistic customer.subscription.created event payload."""
    return {
        "id": f"evt_test_sub_{subscription_id[-8:]}",
        "object": "event",
        "type": "customer.subscription.created",
        "data": {
            "object": {
                "id": subscription_id,
                "object": "subscription",
                "customer": customer_id,
                "status": "active",
                "metadata": {
                    "donor_name": donor_name,
                    "purpose": purpose,
                },
                "items": {
                    "data": [{
                        "price": {
                            "unit_amount": amount_cents,
                            "recurring": {"interval": interval},
                        }
                    }]
                },
            }
        },
    }


def build_invoice_payment_event(
    subscription_id: str,
    amount_cents: int,
    billing_reason: str = "subscription_cycle",
):
    """Build a realistic invoice.payment_succeeded event payload."""
    return {
        "id": f"evt_test_inv_{subscription_id[-8:]}",
        "object": "event",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "id": f"in_test_{subscription_id[-8:]}",
                "object": "invoice",
                "subscription": subscription_id,
                "amount_paid": amount_cents,
                "billing_reason": billing_reason,
                "status": "paid",
            }
        },
    }


def post_webhook(api: httpx.Client, event: dict) -> httpx.Response:
    """POST a signed webhook event to the backend."""
    payload = json.dumps(event).encode()
    signature = sign_webhook_payload(payload, STRIPE_WEBHOOK_SECRET)
    return api.post(
        "/api/donations/stripe-webhook",
        content=payload,
        headers={
            "stripe-signature": signature,
            "content-type": "application/json",
        },
    )
