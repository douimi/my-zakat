# MyZakat Production Readiness Report

**Date:** April 7, 2026
**Platform:** MyZakat Donation Platform
**Domain:** myzakat.org | VPS IP: 31.97.131.31

---

## Table of Contents

1. [Critical Issues (Must Fix Before Go-Live)](#1-critical-issues)
2. [Stripe Integration Audit](#2-stripe-integration-audit)
3. [Security Vulnerabilities](#3-security-vulnerabilities)
4. [Performance Issues](#4-performance-issues)
5. [Bug Report](#5-bug-report)
6. [Stripe Test Scenario Document](#6-stripe-test-scenario-document)
7. [Coolify Deployment Guide](#7-coolify-deployment-guide)
8. [Production Checklist](#8-production-checklist)

---

## 1. Critical Issues

### CRITICAL-1: Webhook Returns Tuple Instead of HTTPResponse

**File:** `backend/routers/donations.py` lines 859, 862, 1159, 1164

The webhook handler returns Python tuples like `{"status": "invalid signature"}, 400` instead of proper FastAPI responses. FastAPI ignores the status code in a tuple return - it will always return 200 OK with the dict body. This means **Stripe never sees a 400/500 error**, so it thinks every webhook succeeds even when signature verification fails.

```python
# BROKEN (current code):
return {"status": "invalid payload"}, 400    # FastAPI ignores the 400!
return {"status": "invalid signature"}, 400  # FastAPI ignores the 400!
return {"status": "webhook error", "error": str(e)}, 500  # Same issue

# FIXED:
from fastapi.responses import JSONResponse
return JSONResponse(status_code=400, content={"status": "invalid payload"})
```

### CRITICAL-2: Exposed Stripe Test Keys in Git

**Files:** `.env`, `backend/.env`

Your actual Stripe test API keys (sk_test_51RV9fw..., pk_test_51RV9fw...) and webhook secret are committed/visible in `.env` files. Before switching to production keys:
1. Rotate your test keys in the Stripe dashboard
2. Ensure `.env` and `backend/.env` are in `.gitignore` (they are, but verify no accidental commits)
3. Never place `sk_live_*` keys in any file that could be committed

### CRITICAL-3: Default Admin Credentials in Code

**File:** `backend/main.py` line 31

Hardcoded default admin: `admin@example.com` / `admin123`. This runs on every startup and creates this user if no admin exists. In production:
- Change the default admin password immediately after first deployment
- Remove or disable the auto-creation in production mode
- Use environment variables for the initial admin credentials

### CRITICAL-4: Production CORS Allows All Origins

**File:** `backend/main.py` lines 166-174

```python
if is_production:
    allow_origins=["*"]  # DANGEROUS in production
```

This defeats CORS protection entirely. Should be restricted to your domain:
```python
if is_production:
    allow_origins=["https://myzakat.org", "https://www.myzakat.org"]
    allow_credentials=True
```

### CRITICAL-5: No Rate Limiting

No rate limiting exists anywhere. This exposes:
- Auth endpoints to brute force attacks
- Donation endpoints to abuse
- Contact form to spam

### CRITICAL-6: Debug Endpoint Exposed Without Auth

**File:** `backend/routers/donations.py` line 817-832

`/api/donations/debug-subscriptions` has NO authentication and returns all subscription data including emails. This must be removed or gated behind admin auth before production.

---

## 2. Stripe Integration Audit

### What's Working Well
- Checkout session creation for one-time payments
- Subscription creation with proper Stripe objects (Customer -> Product -> Price -> Session)
- Webhook signature verification (with the fix from CRITICAL-1)
- Pending record creation before redirect (good fallback pattern)
- Certificate generation and auto-email on payment success
- Subscription lifecycle handling (active, past_due, canceled)
- Amount conversion (dollars <-> cents) is consistent

### Issues to Fix

#### STRIPE-1: Missing `invoice.payment_succeeded` handling for initial subscription payment
When a subscription is created, both `checkout.session.completed` (mode=subscription) and `customer.subscription.created` fire. But the actual payment arrives via `invoice.payment_succeeded` with `billing_reason="subscription_create"`. Your code handles this, BUT it creates a duplicate donation record because `create_subscription()` already creates a `Donation` with "Recurring monthly - Pending" AND the webhook creates another one. You need deduplication logic.

**Fix:** In the `invoice.payment_succeeded` handler, check if a pending donation already exists for this subscription before creating a new one.

#### STRIPE-2: New Stripe Customer Created on Every Subscription
**File:** `backend/routers/donations.py` line 449

Every subscription call creates a new `stripe.Customer`. If a returning donor subscribes again, they'll have multiple customer records. Use `stripe.Customer.list(email=subscription.email)` to check for existing customers first.

#### STRIPE-3: Product Created Per Subscription
**File:** `backend/routers/donations.py` line 461

A new Product is created for every subscription. Stripe recommends reusing products and creating different prices. Create a single "Recurring Donation" product and reuse it.

#### STRIPE-4: Missing Webhook Events
You should handle these additional events for production robustness:
- `payment_intent.payment_failed` - for one-time payment failures
- `charge.refunded` - to track refunds
- `charge.dispute.created` - to track chargebacks
- `customer.subscription.updated` - for plan changes

#### STRIPE-5: Webhook Secret Not Configured = Silent Failure
**File:** `backend/routers/donations.py` lines 848-850

If webhook secret is missing, the handler returns 200 with a message instead of raising an error. This silently drops all webhooks.

```python
# Current (bad):
if not webhook_secret:
    return {"status": "webhook secret not configured"}  # Returns 200!

# Fix:
if not webhook_secret:
    raise HTTPException(status_code=500, detail="Webhook secret not configured")
```

#### STRIPE-6: Stripe API Key Logging
**File:** `backend/routers/donations.py` lines 268-274

The payment session endpoint logs partial Stripe API keys. Remove this in production:
```python
logger.info(f"  stripe.api_key value: {stripe.api_key[:10] + '...' if stripe.api_key else 'None'}")
```

#### STRIPE-7: No Idempotency Keys
Stripe API calls don't use idempotency keys. If a network retry happens, duplicate charges could occur. Add `idempotency_key` to `checkout.Session.create()` and `Subscription.create()`.

### Stripe Best Practices Alignment

| Practice | Status |
|----------|--------|
| Webhook signature verification | Implemented (fix response codes) |
| Amounts in smallest currency unit | Implemented correctly |
| Metadata on sessions | Implemented |
| Pending records before redirect | Implemented |
| Certificate auto-email | Implemented |
| Idempotency keys | Missing |
| Customer reuse | Missing |
| Product reuse | Missing |
| Refund handling | Missing |
| Dispute handling | Missing |
| SCA/3DS | Handled by Stripe Checkout |
| PCI compliance | Compliant (Stripe handles card data) |

---

## 3. Security Vulnerabilities

### HIGH Severity

#### SEC-1: JWT Secret Key Fallback
**File:** `backend/auth_utils.py` line 16
```python
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
```
If the env var is missing, all tokens are signed with a well-known default. In production, fail hard if SECRET_KEY is not set.

#### SEC-2: No Input Sanitization for XSS
User inputs (names, messages, story content, html_content fields) are stored raw and could contain malicious scripts. Add HTML sanitization using a library like `bleach` for any user-generated content that gets rendered.

#### SEC-3: No Password Complexity Requirements
The auth system accepts any password including "a". Enforce minimum length (8+ chars) and complexity for production.

#### SEC-4: 7-Day JWT Expiration
**File:** `backend/auth_utils.py` line 19
Token expiration of 7 days is too long for a financial platform. Use 1-hour access tokens with refresh tokens.

#### SEC-5: Cancel Subscription Has No Auth
**File:** `backend/routers/donations.py` line 572
`/api/donations/cancel-subscription` accepts any request with a subscription ID - no authentication required. Anyone who knows a subscription ID can cancel it.

#### SEC-6: PostgreSQL Port Exposed
**File:** `docker-compose.traefik.yml` line 36
```yaml
ports:
  - "5432:5432"  # Expose PostgreSQL port for external access
```
Database port is exposed to the internet. Remove this in production.

### MEDIUM Severity

#### SEC-7: CSP Allows unsafe-inline
**File:** `frontend/nginx.conf`
Content-Security-Policy allows `'unsafe-inline'` which weakens XSS protection. Use nonces or hashes for inline scripts.

#### SEC-8: MinIO Default Credentials
**File:** `docker-compose.traefik.yml` line 141
MinIO uses `minioadmin:minioadmin` as defaults. Set strong credentials via env vars.

#### SEC-9: No Password Reset Flow
Users have no way to reset forgotten passwords. This will cause support burden and users creating duplicate accounts.

#### SEC-10: S3 Public URL Uses HTTP
**File:** `env.production` line 28
`S3_PUBLIC_URL=http://31.97.131.31:9000` - media served over unencrypted HTTP. Route through your domain with HTTPS instead.

---

## 4. Performance Issues

#### PERF-1: N+1 Query Potential in Donation Stats
**File:** `backend/routers/donations.py` line 176-203
The `/stats` endpoint makes multiple separate queries. Consider combining into a single query.

#### PERF-2: No Database Indexes on Frequently Queried Fields
Missing indexes on:
- `donations.email` (used in webhook lookups)
- `donations.frequency` (used in LIKE queries in webhook)
- `donation_subscriptions.email` (used in webhook lookups)
- `donation_subscriptions.status` (filtered frequently)

#### PERF-3: Sync Startup Cleanup
**File:** `backend/main.py` line 117-141
Startup cleanup runs in a thread with `time.sleep(5)`. Use FastAPI's `@app.on_event("startup")` with proper async handling.

#### PERF-4: Redis Not Used
Redis is deployed but not referenced anywhere in the backend code. It's consuming resources without providing value. Either implement caching (e.g., for donation stats) or remove the Redis container.

---

## 5. Bug Report

#### BUG-1: Duplicate Donations from Subscriptions
When creating a subscription, `create_subscription()` creates a pending Donation record (line 544-551). Then `customer.subscription.created` webhook creates another Donation (line 1042-1048). Then `invoice.payment_succeeded` creates yet another (line 1079-1086). Result: up to 3 donation records per subscription.

#### BUG-2: Webhook Error Handling Returns Wrong Type
As described in CRITICAL-1, tuples returned from the webhook endpoint don't set HTTP status codes in FastAPI.

#### BUG-3: DonationSuccess Page Doesn't Verify Payment
**File:** `frontend/src/pages/DonationSuccess.tsx`
The success page shows "Thank You!" without verifying the payment actually succeeded. The `session_id` from the URL is not checked. A user could visit `/donation-success?session_id=fake` and see the success message. Add backend verification of the session status.

#### BUG-4: Bare `except` in Subscription Status Update
**File:** `backend/routers/donations.py` lines 664, 674
```python
except:
    continue
```
Bare except clauses swallow all errors silently, including programming errors. Use `except Exception as e:` with logging.

#### BUG-5: Subscription Lookup by Email Is Fragile
**File:** `backend/routers/donations.py` line 1003-1006
Finding pending subscriptions by email + status can match the wrong subscription if a user has multiple pending subscriptions. Match by `stripe_session_id` or `stripe_customer_id` instead.

#### BUG-6: `datetime.utcnow()` Deprecated
Python 3.12+ deprecates `datetime.utcnow()`. Use `datetime.now(timezone.utc)` instead.

---

## 6. Stripe Test Scenario Document

This document should be executed by your QA team/client before switching to production keys. Use Stripe test card numbers from: https://docs.stripe.com/testing

### Pre-Test Setup
1. Ensure test Stripe keys are configured
2. Set up Stripe webhook endpoint in Stripe Dashboard -> Developers -> Webhooks
   - URL: `https://myzakat.org/api/donations/stripe-webhook` (or your test URL)
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
3. Open the Stripe Dashboard in another tab to monitor events

---

### Test Case 1: One-Time Donation - Successful Payment
**Steps:**
1. Navigate to `/donate`
2. Enter: Name = "Test User", Email = "test@example.com"
3. Select "One-Time" frequency
4. Select purpose "General Donation"
5. Enter amount: $50 (or click the $50 quick amount)
6. Click "Donate Now"
7. On Stripe Checkout page, use card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g., 12/28)
   - CVC: any 3 digits (e.g., 123)
8. Complete payment

**Expected Results:**
- [ ] Redirected to Stripe Checkout page
- [ ] After payment, redirected to `/donation-success?session_id=...`
- [ ] Success page displays "Thank You!" message
- [ ] Donation appears in Admin Dashboard (`/admin/donations`)
- [ ] Donation status is NOT "Pending"
- [ ] Donation amount shows $50.00
- [ ] Certificate email received at test@example.com
- [ ] Stripe Dashboard shows successful payment
- [ ] Webhook event `checkout.session.completed` appears in Stripe logs

---

### Test Case 2: One-Time Donation - Card Declined
**Steps:**
1. Navigate to `/donate`
2. Fill form with valid details, amount $25
3. On Stripe Checkout, use card: `4000 0000 0000 0002` (always declined)
4. Attempt payment

**Expected Results:**
- [ ] Stripe shows "Your card was declined" error
- [ ] User can retry with a different card
- [ ] No donation record created with "completed" status in database
- [ ] A "Pending" donation may exist (this is expected)

---

### Test Case 3: One-Time Donation - 3D Secure Authentication
**Steps:**
1. Navigate to `/donate`
2. Fill form, amount $100
3. On Stripe Checkout, use card: `4000 0025 0000 3155` (requires 3DS)
4. Complete 3DS authentication popup
5. Complete payment

**Expected Results:**
- [ ] 3DS authentication popup appears
- [ ] After authenticating, payment completes
- [ ] Donation recorded successfully
- [ ] Certificate email received

---

### Test Case 4: One-Time Donation - 3D Secure Fails
**Steps:**
1. Navigate to `/donate`
2. Fill form, amount $75
3. On Stripe Checkout, use card: `4000 0084 0000 1629` (3DS fails)
4. Fail the 3DS authentication

**Expected Results:**
- [ ] 3DS popup appears
- [ ] After failing authentication, payment is declined
- [ ] No completed donation record in database

---

### Test Case 5: Monthly Subscription - Successful
**Steps:**
1. Navigate to `/donate`
2. Enter: Name = "Monthly Donor", Email = "monthly@example.com"
3. Select "Monthly" frequency
4. Select payment day: 15
5. Enter amount: $25
6. Click "Donate Now"
7. Complete payment with card: `4242 4242 4242 4242`

**Expected Results:**
- [ ] Redirected to Stripe Checkout (subscription mode)
- [ ] After payment, redirected to success page
- [ ] Subscription appears in Admin > Subscriptions
- [ ] Subscription status is "active" (may briefly show "pending" then update)
- [ ] Donation record created for initial payment
- [ ] Certificate email received
- [ ] Stripe Dashboard shows active subscription

---

### Test Case 6: Annual Subscription - Successful
**Steps:**
1. Navigate to `/donate`
2. Select "Annually" frequency
3. Fill details, amount $500
4. Complete payment

**Expected Results:**
- [ ] Subscription created with yearly interval
- [ ] Subscription status = "active"
- [ ] Initial donation recorded

---

### Test Case 7: Subscription Cancellation
**Steps:**
1. Complete Test Case 5 first
2. Go to Stripe Dashboard > Subscriptions
3. Cancel the test subscription

**Expected Results:**
- [ ] Webhook `customer.subscription.deleted` fires
- [ ] Subscription status updates to "canceled" in Admin panel
- [ ] No further charges occur

---

### Test Case 8: Subscription Payment Failure
**Steps:**
1. Create a subscription with card: `4000 0000 0000 0341` (attaches but fails on charge)
   Note: This test may require using the Stripe CLI or Dashboard to simulate

**Expected Results:**
- [ ] `invoice.payment_failed` webhook fires
- [ ] Subscription status changes to "past_due"

---

### Test Case 9: Minimum Amount Validation
**Steps:**
1. Navigate to `/donate`
2. Enter amount: $0.50
3. Try to submit

**Expected Results:**
- [ ] Error message: amount must be at least $1.00
- [ ] No Stripe session created

---

### Test Case 10: Webhook Signature Verification
**Steps:**
1. Use curl to send a fake webhook to your endpoint:
```bash
curl -X POST https://myzakat.org/api/donations/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: fake_signature" \
  -d '{"type": "checkout.session.completed"}'
```

**Expected Results:**
- [ ] Returns 400 status code (after fixing CRITICAL-1)
- [ ] No donation records created
- [ ] Error logged in backend

---

### Test Case 11: Donation with Pre-filled Amount (from Zakat Calculator)
**Steps:**
1. Navigate to `/donate?amount=150&frequency=One-Time`
2. Verify amount field shows $150
3. Complete the donation

**Expected Results:**
- [ ] Amount pre-filled to $150
- [ ] Frequency pre-filled to "One-Time"
- [ ] Payment processes correctly

---

### Test Case 12: Multiple Donations Same Email
**Steps:**
1. Make two separate $25 donations with the same email
2. Check admin dashboard

**Expected Results:**
- [ ] Both donations appear as separate records
- [ ] Both have unique IDs and timestamps
- [ ] Both certificates generated

---

### Test Case 13: Large Donation Amount
**Steps:**
1. Donate $9,999.99

**Expected Results:**
- [ ] Payment processes correctly
- [ ] Amount stored correctly (check for floating point issues)
- [ ] Certificate shows correct amount

---

### Test Case 14: Special Characters in Name
**Steps:**
1. Donate with name: "O'Brien-Smith (Jr.)"
2. Check donation record and certificate

**Expected Results:**
- [ ] Name stored correctly
- [ ] Certificate renders name correctly
- [ ] No SQL injection or XSS

---

### Test Case 15: Stripe Webhook - Verify All Events
**Steps:**
Use the Stripe CLI to test all webhook events:
```bash
stripe listen --forward-to localhost:8000/api/donations/stripe-webhook
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

**Expected Results:**
- [ ] Each event processed without errors
- [ ] Database updated correctly for each event
- [ ] No unhandled exceptions in logs

---

### Test Case 16: Network Interruption During Payment
**Steps:**
1. Start a donation
2. Get to Stripe Checkout page
3. Close the browser tab without completing
4. Check database

**Expected Results:**
- [ ] A "Pending" donation record exists
- [ ] No "completed" donation created
- [ ] User can try again

---

### Post-Test Verification
After all tests:
- [ ] Check Admin Dashboard shows all test donations
- [ ] Verify no orphaned "Pending" records for completed payments
- [ ] Check Stripe Dashboard webhook logs - all events should show 200 responses
- [ ] Verify certificate PDFs can be downloaded from admin panel
- [ ] Check email delivery logs for sent certificates

---

## 7. Coolify Deployment Guide

### Why Coolify Over Manual Deployment
- Auto-deploy on git push (no SSH needed)
- Built-in SSL via Let's Encrypt
- GUI for managing containers, env vars, and logs
- Health monitoring and auto-restart
- Zero-downtime deployments

### Step-by-Step: Migrate to Coolify

#### Step 1: Install Coolify on Your VPS

```bash
# SSH into your VPS
ssh root@31.97.131.31

# Stop current containers
cd /root/prod
docker-compose -f docker-compose.traefik.yml down

# Install Coolify (one command)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify will be available at `http://31.97.131.31:8000` (it uses port 8000 by default - you may need to change your backend port).

#### Step 2: Initial Coolify Setup
1. Open `http://31.97.131.31:8000` in your browser
2. Create your admin account
3. Add your server (localhost) as a resource
4. Connect your GitHub account (Settings > Sources > GitHub)

#### Step 3: Configure Your Application

Since your app has multiple services, you'll use Coolify's **Docker Compose** deployment:

1. In Coolify dashboard: **New Resource > Docker Compose**
2. Connect your GitHub repository
3. Set the docker compose file to `docker-compose.traefik.yml`
4. Configure environment variables in the Coolify UI (copy from `env.production` but with real values)

#### Step 4: Environment Variables in Coolify

Add these in the Coolify environment variables section (never commit production values):

```
POSTGRES_USER=myzakat_user
POSTGRES_PASSWORD=<generate-strong-password>
SECRET_KEY=<generate-64-char-random-string>
STRIPE_SECRET_KEY=sk_live_<your-production-key>
STRIPE_PUBLISHABLE_KEY=pk_live_<your-production-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-production-webhook-secret>
MINIO_ROOT_USER=<strong-username>
MINIO_ROOT_PASSWORD=<strong-password>
MAIL_USERNAME=<your-email>
MAIL_PASSWORD=<your-email-app-password>
```

#### Step 5: Configure Auto-Deploy

1. In your resource settings, enable "Auto Deploy"
2. Set the branch to `main` (or your production branch)
3. Coolify will automatically create a GitHub webhook
4. Every push to `main` triggers a new deployment

#### Step 6: Configure Domain & SSL

1. In Coolify, go to your resource > Settings > Domains
2. Add `myzakat.org` and `www.myzakat.org`
3. Enable "Generate SSL" (uses Let's Encrypt automatically)
4. Ensure your DNS A records point to `31.97.131.31`

#### Step 7: Database Persistence

Coolify handles Docker volumes automatically. Your PostgreSQL data will persist across deployments. For safety:

1. Set up automated backups in Coolify (Settings > Backups)
2. Configure a backup schedule (daily recommended)
3. Test backup restoration before going live

#### Step 8: Health Checks

Add a health check endpoint (you already have `/health`). Configure in Coolify:
- Health check URL: `/health`
- Interval: 30s
- Timeout: 10s

### Alternative: Keep Docker Compose + Add GitHub Actions CI/CD

If you prefer not to use Coolify, here's a GitHub Actions workflow for automated deployment:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /root/prod
            git pull origin main
            docker-compose -f docker-compose.traefik.yml --env-file env.production build --no-cache
            docker-compose -f docker-compose.traefik.yml --env-file env.production up -d
            docker image prune -f
```

Add these GitHub repository secrets:
- `VPS_HOST`: `31.97.131.31`
- `VPS_SSH_KEY`: Your VPS SSH private key

---

## 8. Production Checklist

### Before Going Live

#### Security
- [ ] Fix CRITICAL-1: Webhook response codes
- [ ] Fix CRITICAL-3: Change default admin password / disable auto-create
- [ ] Fix CRITICAL-4: Restrict CORS to your domain only
- [ ] Fix CRITICAL-6: Add auth to debug-subscriptions endpoint or remove it
- [ ] Fix SEC-1: Remove SECRET_KEY default fallback, fail if not set
- [ ] Fix SEC-5: Add authentication to cancel-subscription endpoint
- [ ] Fix SEC-6: Remove PostgreSQL port exposure from docker-compose
- [ ] Add rate limiting (use `slowapi` package for FastAPI)
- [ ] Set strong passwords for all services (PostgreSQL, MinIO, JWT secret)
- [ ] Remove or disable all debug/sync endpoints in production

#### Stripe
- [ ] Fix STRIPE-1: Deduplicate subscription donation records
- [ ] Fix STRIPE-5: Fail loudly if webhook secret missing
- [ ] Fix STRIPE-6: Remove API key logging
- [ ] Remove BUG-4: Fix bare except clauses
- [ ] Register webhook endpoint in Stripe Dashboard (production mode)
- [ ] Configure all required webhook events in Stripe Dashboard
- [ ] Switch to production Stripe keys (sk_live_, pk_live_)
- [ ] Update STRIPE_WEBHOOK_SECRET to production webhook secret
- [ ] Test with Stripe CLI: `stripe listen --forward-to your-url`
- [ ] Run all 16 test scenarios from Section 6

#### Infrastructure
- [ ] Set up automated deployment (Coolify or GitHub Actions)
- [ ] Configure automated database backups
- [ ] Set up monitoring/alerting (uptime monitoring at minimum)
- [ ] Configure log rotation for Docker containers
- [ ] Ensure DNS A records: myzakat.org -> 31.97.131.31
- [ ] Verify SSL certificates are auto-renewing
- [ ] Remove all hardcoded IP addresses from frontend builds (use domain)
- [ ] Set `S3_PUBLIC_URL` to use HTTPS domain, not HTTP IP

#### Application
- [ ] Fix BUG-1: Deduplicate subscription donation records
- [ ] Fix BUG-3: Verify payment on success page
- [ ] Fix BUG-5: Use stripe_session_id for subscription lookups
- [ ] Update `frontend/env.example` with production VITE_API_URL
- [ ] Test email delivery (certificate emails, verification emails)
- [ ] Verify PDF certificate generation works correctly
- [ ] Test all admin panel functionality
- [ ] Test mobile responsiveness

#### After Go-Live
- [ ] Monitor Stripe webhook delivery in Dashboard for first 48 hours
- [ ] Check for failed webhooks and investigate
- [ ] Monitor server resources (CPU, memory, disk)
- [ ] Set up alerts for: webhook failures, high error rates, disk space
- [ ] Schedule regular database backups verification
- [ ] Plan for: password reset feature, refund handling, dispute handling

---

## Priority Order for Fixes

### Phase 1: Must Fix (Block Go-Live)
1. CRITICAL-1: Fix webhook response codes
2. CRITICAL-4: Fix CORS configuration
3. CRITICAL-6: Secure debug endpoints
4. SEC-5: Add auth to cancel-subscription
5. SEC-6: Remove PostgreSQL port exposure
6. STRIPE-5: Fix webhook secret missing behavior
7. STRIPE-6: Remove API key logging

### Phase 2: Should Fix (High Priority)
8. SEC-1: Remove SECRET_KEY fallback
9. BUG-1: Fix duplicate donations from subscriptions
10. BUG-3: Verify payment on success page
11. Add rate limiting
12. STRIPE-7: Add idempotency keys

### Phase 3: Nice to Have (Post-Launch)
13. STRIPE-2: Customer reuse
14. STRIPE-3: Product reuse
15. STRIPE-4: Additional webhook events
16. SEC-9: Password reset flow
17. PERF-2: Database indexes
18. PERF-4: Implement Redis caching or remove Redis
