# Integration Tests

These tests run against the **real Docker stack** with real Stripe test-mode API keys.
They simulate the full user journey end-to-end.

## Prerequisites

1. **Docker stack running:**
   ```bash
   docker-compose up -d
   ```

2. **`.env` at project root** with valid Stripe test keys:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. **Python dependencies** (install once):
   ```bash
   pip install httpx python-dotenv stripe
   ```

## Run

```bash
cd backend
pytest tests/integration/ -v -s
```

The `-s` flag shows print output (useful for debugging Stripe session IDs).

## What's tested

| Test | What it does |
|------|-------------|
| **One-time donation lifecycle** | Creates real Stripe session → verifies pending record in PostgreSQL → simulates webhook with signed payload → verifies donation is confirmed |
| **Subscription lifecycle** | Creates real subscription session → simulates checkout.completed → subscription.created → invoice.payment_succeeded → verifies all DB records |
| **Webhook signature verification** | Sends a bad signature → expects 400 rejection |
| **Payment failure** | Simulates invoice.payment_failed → verifies subscription status becomes past_due |
| **Subscription cancellation** | Simulates customer.subscription.deleted → verifies status becomes canceled |
| **Admin sync ("Refresh" button)** | Calls sync-stripe-data endpoint → verifies it works without errors |
| **Zakat → Donate flow** | Calculates Zakat → uses result as donation amount → creates real Stripe session → verifies amount matches |
| **Stats aggregation** | Verifies /stats endpoint returns valid structure with real data |

## How webhook simulation works

Since Stripe webhooks are configured for your production domain and can't reach localhost,
we **simulate them locally** by:

1. Building a realistic event payload (same structure Stripe sends)
2. Signing it with your `STRIPE_WEBHOOK_SECRET` using HMAC-SHA256 (same algorithm Stripe uses)
3. POSTing it to `/api/donations/stripe-webhook` with the signature header

This passes the backend's `stripe.Webhook.construct_event()` verification because we use
the same secret. The backend processes it exactly as if Stripe sent it.

## Notes

- Tests create real Stripe checkout sessions (in test mode). These are harmless and expire automatically.
- Each test uses a unique email (`integration-{uuid}@test.myzakat.org`) to avoid collisions.
- Tests require a working admin account (default: admin@example.com / admin123).
- The admin sync test creates unpaid sessions, so sync won't find "new" paid data — it just verifies the endpoint works.
