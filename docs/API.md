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

## Project proposals

A funding request is a **dossier** plus an append-only chain of **versions**.
The dossier holds the applicant's email — the identity key — and the review
status; every submission writes one immutable version carrying the 26 form
fields and the reviewer's verdict on that version.

Endpoints marked *admin* accept an **admin or manager** JWT. The portal
endpoints take a portal token instead, which is a different credential
(see [Submitter portal](#submitter-portal) below).

### `POST /api/project-proposals/` — public

Submits a proposal. Always opens a **new** dossier at version 1 — one email may
own several. A revision of an existing dossier goes through the portal, never
through here.

```json
Request: {
  "full_name": "Jane Doe", "national_id": "A1234567", "date_of_birth_year": 1990,
  "place_of_residence": "Casablanca", "mobile_number": "+212600000000",
  "email": "jane@example.com", "educational_level": "Bachelor degree",

  "project_name": "Clean water for Ait Ourir",
  "project_description": "...", "problem_solved": "...",
  "target_beneficiaries": "...", "community_impact": "...",
  "expected_impact": "...",

  "implementation_steps": "...", "implementation_location": "...",
  "required_materials": "...", "expected_duration": "6 months",
  "continuity_plan": "...", "feasibility": "...", "expected_challenges": "...",

  "number_of_beneficiaries": 50, "cost_per_unit_usd": 20,
  "unit_type": "household", "additional_expenses_usd": 100,
  "additional_expenses_description": "Transport", "total_amount_usd": 1100,

  "sms_consent": false, "sms_consent_text": null
}
Response (201): {
  "id": 7,
  "version_no": 1,
  "message": "Your proposal has been submitted. Our team will review it and get back to you.",
  "submitted_at": "2026-09-18T10:22:04"
}
```

**Validation:** `total_amount_usd` must agree with
`number_of_beneficiaries × cost_per_unit_usd + additional_expenses_usd` to
within $1 (`422` otherwise). SMS consent is optional and off by default; the
wording the applicant agreed to is stored only when `sms_consent` is `true`.

Queues the `proposal_received` email.

### `GET /api/project-proposals/` — admin

Lists dossiers, most recently touched first (`updated_at DESC`).

Query params: `status_filter` (`submitted` | `under_review` |
`changes_requested` | `approved` | `rejected` — an unrecognized value is
ignored rather than rejected, and no filter is applied), `skip` (default 0),
`limit` (default 100, capped at 500).

```json
{
  "total": 12,
  "items": [{
    "id": 7, "email": "jane@example.com", "status": "changes_requested",
    "submitted_at": "...", "updated_at": "...",
    "reviewed_at": "...", "reviewed_by": 3,
    "version_count": 2, "current_version_no": 2,
    "decision_comment": "Please break the budget down per village.",
    "internal_note": "Second time we have asked.",
    "submitted_ip": "41.0.0.0",
    "sms_consent": false, "sms_consent_at": null, "sms_consent_text": null,
    "full_name": "Jane Doe", "project_name": "...",
    // ...all 26 content fields of the current version, flattened
    "versions": [{
      "id": 14, "version_no": 1,
      "submitted_at": "...", "submitted_ip": "41.0.0.0",
      "decision": "changes_requested",
      "decision_comment": "...", "internal_note": "...",
      "decided_at": "...", "decided_by": 3
    }]
  }]
}
```

The current version's content is flattened at the top level so the admin table
reads it unchanged; `versions[]` is the whole chain, oldest first, each entry
carrying its own verdict. `internal_note` is staff-only — the portal uses a
separate serializer that cannot emit it.

### `GET /api/project-proposals/{id}` — admin

The same object for a single dossier, `versions[]` included. `404` if unknown.

### `GET /api/project-proposals/{id}/versions/{n}` — admin

One frozen version in full: its content exactly as submitted, its decision
fields, `proposal_id`, and the dossier's current `status`. `404` if either the
dossier or that version number is unknown.

### `PATCH /api/project-proposals/{id}/status` — admin

Records the reviewer's verdict on the dossier's **current** version.

```json
Request: {
  "status": "changes_requested",   // submitted | under_review |
                                   // changes_requested | approved | rejected
  "decision_comment": "Please break the budget down per village.",
  "internal_note": "Second time we have asked."   // staff only, never shown
}
Response: the same object as `GET /api/project-proposals/{id}`
```

- `decision_comment` is **required and non-blank** for `rejected` and
  `changes_requested` — `400` otherwise. Omitting it (`null`) leaves the
  existing comment untouched, which is how the console saves an internal note
  on its own.
- `approved`, `rejected` and `changes_requested` stamp `decision`, `decided_at`
  and `decided_by` on the current version. Moving back to `submitted` or
  `under_review` changes the dossier's status only: a verdict already recorded
  on a version is never erased.
- An unknown status → `400`. A dossier with no version to decide on → `409`.
- The applicant is emailed only when the status actually **changes**, so
  re-saving a note on an already-rejected dossier re-notifies nobody.
  `submitted` and `under_review` send no email at all.

### `DELETE /api/project-proposals/{id}` — admin

Deletes the dossier and its entire version chain.

```json
Response: { "deleted": true }
```

### `GET /api/project-proposals/{id}/pdf` — admin

PDF of the current version. `404` when the dossier has no content to export.

### `GET /api/project-proposals/{id}/versions/{n}/pdf` — admin

PDF of that one version. Both stream `application/pdf` as
`proposal-{id}-v{n}-{slug}.pdf`. The footer shows the dossier's *current*
status even on an exported older version; that version's own verdict stays in
its `decision` field.

### Submitter portal

Applicants have no account. They prove control of the address on their dossier
with a six-digit code emailed to it, and receive a **portal token** valid for
30 minutes.

That token is not a staff session. `verify_token()` refuses any JWT whose `typ`
claim is anything other than `"user"`, so a portal token minted for an address
that also owns a staff account cannot reach the admin console. The audit
middleware refuses it as well, so such a request is never logged under a staff
member's name.

#### `POST /api/project-proposals/portal/request-code` — public

```json
Request:  { "email": "jane@example.com" }
Response (202): { "sent": true, "message": "A sign-in code is on its way to jane@example.com." }
Response (404): { "detail": "We have no proposal filed under this address." }
Response (429): { "detail": "Too many sign-in codes requested. Please wait a few minutes and try again." }
```

The endpoint answers truthfully: `202` and a code is emailed when the address
has at least one dossier, `404` when it has none, and `429` when the address
(3 per 15 minutes) or the caller's IP (10 per hour) has asked too often.
Issuing a code consumes any earlier unconsumed code for that address, so only
the newest one ever works.

This means the endpoint reveals whether a given address has a proposal on
file — a deliberate reversal of an earlier design that answered an identical
`202` regardless of the address, to prevent that exact disclosure. See
[`docs/superpowers/specs/2026-09-19-funding-menu-and-portal-lookup-design.md`](superpowers/specs/2026-09-19-funding-menu-and-portal-lookup-design.md)
("Why the lookup now reveals whether an address has a proposal") for why the
uniform reply was dropped.

#### `POST /api/project-proposals/portal/verify-code` — public

```json
Request:  { "email": "jane@example.com", "code": "048213" }
Response: { "token": "eyJ...", "expires_in": 1800 }
```

Codes are bcrypt-hashed at rest, live 10 minutes, are single-use, and are burned
after 5 wrong guesses. Every failure mode — no code on file, expired, already
used, attempts exhausted, wrong digits — returns the same `401`, so they cannot
be told apart.

#### `GET /api/project-proposals/portal/me` — portal token

Every dossier submitted from the token's address, newest first.

```json
{
  "email": "jane@example.com",
  "items": [{
    "id": 7, "project_name": "Clean water for Ait Ourir",
    "status": "changes_requested", "editable": true,
    "submitted_at": "...", "updated_at": "...", "version_no": 2,
    "decision_comment": "Please break the budget down per village.",
    "content": { }   // the 26 content fields of the current version
  }]
}
```

`editable` is true only in `changes_requested`. `internal_note`, `submitted_ip`,
`reviewed_by` and `decided_by` are absent by construction: the portal has its
own serializer rather than a flag on the admin one.

#### `PUT /api/project-proposals/portal/{id}` — portal token

Appends the next version of one of this address's dossiers and returns the
dossier to `submitted`. The body is the same schema as a first submission, so a
revision can never be less complete than the original; its `email` field is
ignored — the dossier's address always wins. Responds with one `/portal/me`
item and queues `proposal_received`.

| HTTP | When |
|---|---|
| `401` | Missing, expired, or non-portal token |
| `404` | No such dossier — **or** it belongs to another address. Never `403`, which would confirm it exists |
| `409` | The dossier is not in `changes_requested`, the only status a submitter may revise from |

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

There is no rate-limiting middleware. The one limited endpoint is
`POST /api/project-proposals/portal/request-code`, which enforces its own caps
by counting rows in `proposal_access_codes` — 3 codes per address per 15
minutes and 10 per IP per hour. Both caps are announced: a capped caller
receives `429` and no email is sent.

Site-wide rate limiting is still unimplemented. Tracked in
[PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) as a
hardening item.

---

## Errors

| HTTP | Meaning |
|---|---|
| 200 | Success |
| 201 | Created (e.g. a new proposal dossier) |
| 202 | Accepted — a sign-in code was emailed (portal code request) |
| 400 | Bad request (validation, business rule) |
| 401 | Missing/invalid JWT |
| 403 | Authenticated but not authorized (e.g. non-admin hitting admin endpoint) |
| 404 | Resource not found — also used where a 403 would leak the existence of someone else's record |
| 409 | Conflict with the resource's current state (e.g. revising a proposal that is not awaiting changes) |
| 422 | Pydantic validation error (malformed body) |
| 429 | Rate limited — the portal's code request, when the address or the caller's IP has asked too often |
| 500 | Server error (logged with traceback) |

Error responses are always JSON: `{ "detail": "human-readable message" }`.
