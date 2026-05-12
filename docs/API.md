# API Reference — MyZakat

Base URL (production): `https://myzakat.org/api`
Base URL (local dev): `http://localhost:8000/api`

All admin endpoints require `Authorization: Bearer <jwt>` with an admin JWT.
User endpoints require a regular user JWT. Public endpoints are anonymous.

Interactive docs (when running locally): **http://localhost:8000/docs**

---

## Conventions

- All requests/responses are JSON unless noted (uploads use `multipart/form-data`).
- Timestamps are UTC, ISO 8601.
- Currency amounts are USD floats (not cents — frontend converts on display).
- Errors return `{ "detail": "message" }` with appropriate HTTP status.

---

## Authentication

### `POST /api/auth/register` — public

Register a new user. Sends an email verification link.

```json
Request:  { "email": "user@example.com", "password": "secret", "name": "Jane Doe" }
Response: { "id": 1, "email": "user@example.com", "is_active": true, "is_admin": false, ... }
```

### `POST /api/auth/login` — public

```json
Request:  { "email": "user@example.com", "password": "secret" }
Response: { "access_token": "eyJ...", "token_type": "bearer" }
```

### `GET /api/auth/me` — authenticated

Returns the current user (decoded from JWT).

### `GET /api/auth/verify-email?token=...` — public

Verifies an email address from the token in the verification email.

### `POST /api/auth/resend-verification` — public

```json
Request: { "email": "user@example.com" }
```

---

## Donations

### `POST /api/donations/create-payment-session` — public

Creates a Stripe Checkout session for a one-time donation.

```json
Request: {
  "amount": 50,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "purpose": "Zakat",
  "frequency": "One-Time"
}
Response: { "id": "cs_live_..." }  // Stripe Checkout session ID
```

**Validation:** Minimum amount $1. Email required and validated.

### `POST /api/donations/create-subscription` — public

Creates a Stripe Subscription Checkout session.

```json
Request: {
  "name": "Jane Doe",
  "email": "jane@example.com",
  "amount": 25,
  "purpose": "General Donation",
  "interval": "month",   // "month" | "year"
  "payment_day": 1       // 1-31
}
Response: { "id": "cs_live_..." }
```

### `POST /api/donations/stripe-webhook` — public (signed by Stripe)

Endpoint Stripe sends webhook events to. Handles:

| Event | Action |
|---|---|
| `checkout.session.completed` (payment mode) | Confirms one-time donation, emails certificate |
| `checkout.session.completed` (subscription mode) | Marks subscription as `checkout_completed` |
| `customer.subscription.created` | Activates the subscription |
| `invoice.payment_succeeded` | Creates a donation record for the charge, emails certificate |
| `invoice.payment_failed` | Sets subscription status to `past_due` |
| `customer.subscription.deleted` | Sets subscription status to `canceled` |
| `checkout.session.expired` | Creates an "Abandoned" donation record |
| `charge.failed` | Creates a "Failed - {reason}" donation record |

Idempotent: each event ID is tracked to skip Stripe retries.

### `POST /api/donations/calculate-zakat` — public

```json
Request: { "cash": 10000, "gold_weight": 100, "gold_price_per_gram": 70, ... }
Response: { "wealth": 250, "gold": 175, "silver": 0, "business_goods": 0,
            "agriculture": 0, "total": 425 }
```

### `GET /api/donations/stats` — public

Returns aggregate stats for the homepage:

```json
{
  "total_donations": 50000,
  "total_donors": 200,
  "recent_donations": [ ... ],
  "impact": { "meals": 25000, "families": 1200, "orphans": 800 }
}
```

Failed and abandoned donations are excluded from totals.

### `GET /api/donations/` — admin

Lists all donations.

### `GET /api/donations/subscriptions` — admin

Lists all donation subscriptions.

### `POST /api/donations/cancel-subscription` — admin

```json
Request: { "subscription_id": "sub_..." }
```

### `POST /api/donations/sync-stripe-data` — admin (dev only)

Manually pulls the 20 most recent Stripe sessions and creates DB records
for any that are missing. Disabled when `ENVIRONMENT=production`.

---

## User dashboard

### `GET /api/user/donations` — authenticated

Donations made by the authenticated user (matched by email).

### `GET /api/user/subscriptions` — authenticated

Active recurring subscriptions for the authenticated user.

### `GET /api/user/dashboard-stats` — authenticated

Personal stats: total given, count of donations, active subscriptions.

### `GET /api/user/certificate/{donation_id}` — authenticated

Returns the PDF certificate for a specific donation (generated on the fly).

### `POST /api/user/email-certificate/{donation_id}` — authenticated

Emails the certificate to the user.

### `POST /api/user/regenerate-certificate/{donation_id}` — authenticated

Forces certificate regeneration.

### `POST /api/user/cancel-subscription/{subscription_id}` — authenticated

User-initiated subscription cancellation.

---

## Content management (admin only)

All these endpoints follow a standard CRUD pattern: `GET /` (list),
`GET /{id}`, `POST /` (create), `PUT /{id}` (update), `DELETE /{id}`.

| Resource | Base path | Notes |
|---|---|---|
| Stories | `/api/stories` | Public GET, admin write |
| Events | `/api/events` | Public GET, admin write. `POST /upload-image` for images |
| Testimonials | `/api/testimonials` | Public GET (approved only), admin write + approve |
| Contact submissions | `/api/contact` | Public POST (submit form), admin read + manage |
| Volunteers | `/api/volunteers` | Public POST (signup), admin read + delete |
| Newsletter subscriptions | `/api/subscriptions` | Public POST (signup), admin read + delete + send |
| Settings | `/api/settings` | Key-value store, admin only |
| Slideshow slides | `/api/slideshow` | Public GET, admin write |
| Urgent needs | `/api/urgent-needs` | Public GET, admin write |
| Gallery items | `/api/gallery` | Public GET, admin write. `POST /upload` for files, `POST /reorder` for bulk |
| Program categories | `/api/program-categories` | Public GET, admin write |
| Programs | `/api/programs` | Public GET, admin write |

### Special endpoints

- `PATCH /api/contact/{id}/resolve` — mark a contact submission resolved
- `POST /api/contact/{id}/reply` — admin replies via email
- `PATCH /api/testimonials/{id}/approve` — make a testimonial public

---

## Media & uploads

### `POST /api/admin/upload-media` — admin

Generic upload to S3. `multipart/form-data` with field `file`.

### `GET /api/uploads/media/images/{filename}` — public

Serves images from S3 with on-the-fly resize:

```
GET /api/uploads/media/images/photo.jpg?w=400
```

Query params:
- `w` — target width (1-1920). Image is resized maintaining aspect ratio.
- `fmt` — `webp` to force WebP output. Otherwise auto-detected from `Accept` header.

In-memory LRU cache prevents repeated S3 downloads. ETag/304 supported.

### `GET /api/uploads/media/videos/{filename}` — public

Serves videos with HTTP range request support (for seeking).

### `GET /api/s3-media/browse` — admin

List S3 objects with metadata.

### `DELETE /api/s3-media/{object_key}` — admin

Delete a file from S3.

### `POST /api/cleanup/orphaned-media` — admin

Find S3 files not referenced by any DB record. With `auto_delete=true`, deletes them.

---

## System

### `GET /health` — public

```json
{ "status": "healthy" }
```

### `GET /api/donations/sync-debug` — admin (dev only)

Returns environment + Stripe configuration status. For local debugging.

---

## Rate limiting

Currently unimplemented. Tracked in
[PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) as a
hardening item.

---

## Errors

| HTTP | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request (validation, business rule) |
| 401 | Missing/invalid JWT |
| 403 | Authenticated but not authorized (e.g. non-admin hitting admin endpoint) |
| 404 | Resource not found |
| 422 | Pydantic validation error (malformed body) |
| 500 | Server error (logged with traceback) |

Error responses are always JSON: `{ "detail": "human-readable message" }`.
