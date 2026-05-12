# Functional Specifications — MyZakat

This document describes **what the application does** from a user perspective.
It is the source of truth for product behavior. For technical architecture,
see [ARCHITECTURE.md](ARCHITECTURE.md). For API details, see [API.md](API.md).

---

## 1. User roles

| Role | How they're identified | What they can do |
|---|---|---|
| **Visitor** | No authentication | Browse public content, calculate Zakat, submit contact/volunteer forms, donate (no account required) |
| **Registered user** | JWT after login | All of the above + access personal dashboard with donation history, manage recurring subscriptions, download/email certificates |
| **Admin** | JWT + `is_admin = true` flag | All of the above + full admin console (manage all content, view all donations, manage users) |

The first admin is auto-created on first startup if no admin exists:
`admin@example.com` / `admin123` — **must be changed in production**.

---

## 2. Donation flow

### 2.1 One-time donation

**User journey:**

1. Visitor lands on `/donate` (or arrives from a "Donate" CTA on any page,
   or from the Zakat calculator with amount pre-filled).
2. Fills the form: amount (quick-select or custom), purpose, frequency = One-Time,
   name, email.
3. Clicks **"Proceed to Payment"**.
4. Backend creates a Stripe checkout session and returns the session ID.
5. Frontend redirects the browser to Stripe Checkout.
6. User enters card details on Stripe-hosted page and pays.
7. On success, Stripe redirects to `/donation-success`.
8. In the background, Stripe sends `checkout.session.completed` webhook.
9. Backend creates a confirmed donation record and emails a PDF certificate.

**Business rules:**
- Minimum donation: **$1**
- Supported currencies: USD only (initial release)
- Email required (used to deliver certificate)
- Purposes: General Donation, Zakat, Emergency Relief, Orphan Care,
  Food & Water Aid, Education, Healthcare

**Edge cases:**
- **Abandoned checkout** — Stripe fires `checkout.session.expired` ~24h later.
  Backend creates an "Abandoned" record so admins have visibility.
- **Card declined** — Stripe fires `charge.failed`. Backend creates a
  "Failed - {reason}" record (e.g. `Failed - transaction_not_allowed`).
- **Webhook duplicate delivery** — Backend uses event ID idempotency cache
  to skip already-processed events.
- **Webhook missed** — Admins can use the "Sync Stripe" button (dev only)
  to recover missing donations.

### 2.2 Recurring donation

**User journey:** identical to one-time but with frequency = Monthly or Annually.
The submit button changes to **"Set up Recurring Donation"** and a blue notice
explains the schedule.

**Behind the scenes:**
- Backend creates a Stripe Customer, Product, Price, and Subscription Checkout Session.
- On `customer.subscription.created`, the subscription is activated in the DB.
- On every `invoice.payment_succeeded`, a new Donation record is created and
  a certificate is emailed. The subscription's `next_payment_date` is updated.
- On `invoice.payment_failed`, the subscription status → `past_due`.
- On `customer.subscription.deleted`, status → `canceled`.

**Cancellation:**
- Users can cancel from their dashboard at `/dashboard`.
- Admins can cancel from `/admin/subscriptions`.

### 2.3 Donation status lifecycle

| Status (frequency field) | When | Visible in admin |
|---|---|---|
| `One-Time` | After successful one-time payment | Confirmed donation, counted in totals |
| `Recurring monthly` / `Recurring yearly` | Each successful recurring charge | Confirmed donation, counted in totals |
| `Failed - {reason}` | Card was declined | Listed but excluded from totals (red badge) |
| `Abandoned` | User left Stripe checkout without paying | Listed but excluded from totals (gray badge) |

There is **no "Pending" status** in the current design — abandoned checkouts
don't create database records until Stripe confirms the outcome.

---

## 3. Zakat calculation

The `/zakat-calculator` page lets users compute their annual Zakat obligation
across multiple asset classes:

| Asset class | Rate | Notes |
|---|---|---|
| Cash, receivables, stocks, retirement, investment property, other valuables, livestock, other assets | 2.5% | Wealth Zakat — liabilities subtracted, applied only if non-zero |
| Gold | 2.5% | `weight_g × price_per_gram × 0.025` |
| Silver | 2.5% | Same formula as gold |
| Business goods | 2.5% | Inventory + business assets |
| Agricultural produce | 5% | Higher rate per Islamic jurisprudence |

The total Zakat amount is shown to the user. A **"Pay Zakat"** CTA redirects
to `/donate?zakat_amount=X` with the amount pre-filled and purpose set to "Zakat".

Additional calculators:
- `/kaffarah-calculator` — expiation for missed fasts / broken oaths
- `/zakat-al-fitr-calculator` — per-household Fitrah for Eid Al-Fitr
- `/zakat-on-gold` — gold-only quick calculator

---

## 4. Content management (admin console)

Admins access `/admin` after logging in. The console is organized by domain:

### 4.1 Dashboard `/admin`
Aggregate stats: total donations, donor count, average donation, charts.

### 4.2 Donations `/admin/donations`
- List, search, filter (by status, type), sort by any column
- Export to CSV
- Status badges: One-Time (blue), Recurring (green), Failed (red), Abandoned (gray)
- Stats exclude failed/abandoned amounts

### 4.3 Subscriptions `/admin/subscriptions`
- List active/canceled/past_due/pending subscriptions
- Admin can cancel a subscription (Stripe + DB updated atomically)

### 4.4 Stories `/admin/stories`
- Create, edit, delete stories shown on `/stories`
- Image + optional video
- Feature flag for homepage display

### 4.5 Events `/admin/events`
- Create, edit, delete events shown on `/events`
- Date, location, image, description

### 4.6 Testimonials `/admin/testimonials`
- Approve/reject user-submitted testimonials before they go public
- Edit text, country, rating, image, video

### 4.7 Contact submissions `/admin/contacts`
- View contact form submissions
- Reply directly (sends an email to the submitter)
- Mark as resolved, delete

### 4.8 Volunteers `/admin/volunteers`
- View volunteer signups
- Email-based contact (no in-app reply yet)

### 4.9 Newsletter subscriptions `/admin/subscriptions`
- View newsletter subscribers
- Send mass newsletter

### 4.10 Programs `/admin/programs` + Program Categories `/admin/program-categories`
- Hierarchical: categories contain programs
- Each can have its own image, video, custom HTML/CSS/JS content
- Categories shown on `/programs`, individual programs at `/programs/:slug`

### 4.11 Gallery `/admin/gallery`
- Upload images/videos to the homepage gallery
- Drag-to-reorder

### 4.12 Slideshow `/admin/slideshow`
- Manage homepage hero slideshow slides
- Image, title, description, CTA link

### 4.13 Urgent Needs `/admin/urgent-needs`
- Create campaigns shown in the header dropdown and at `/urgent-needs/:slug`
- Supports custom HTML/CSS/JS for tailored layouts
- Donate buttons within urgent-need content auto-redirect to `/donate?purpose={title}`

### 4.14 Settings `/admin/settings`
- Key-value editable platform settings (impact stats, feature flags, hero video)

### 4.15 Users `/admin/users`
- List all registered users
- Toggle admin flag, toggle active status, delete account
- Reset password (sends email)

### 4.16 S3 Media `/admin/s3-media`
- Browse files directly in MinIO/S3
- See which DB record references each file
- Delete unreferenced files

### 4.17 Cleanup `/admin/cleanup`
- Scan for orphaned media (S3 files not referenced in any DB record)
- One-click auto-cleanup with usage report

---

## 5. Contact & volunteer flows

### 5.1 Contact form (`/contact`)
1. Visitor fills name, email, message.
2. Backend stores the submission and sends two emails (in background):
   - **To admin** (`info@myzakat.org`): full message + link to admin panel
   - **To visitor**: thank-you acknowledgement + copy of their message

### 5.2 Volunteer form (`/volunteer`)
Same dual-notification pattern: admin gets the application, volunteer gets a thank-you.

### 5.3 Newsletter signup
Footer form. Stores the email; sends no auto-email until a newsletter campaign is sent.

---

## 6. Authentication

- Email/password registration with email verification (token sent via SMTP).
- Login returns a JWT (HS256, 7-day expiry).
- Token stored in `localStorage` on the frontend; sent as
  `Authorization: Bearer <token>` on subsequent requests.
- Admin endpoints are guarded by `get_current_admin()` which decodes the JWT
  and verifies `is_admin = true` in the database.

---

## 7. Email communications

Sent via the configured SMTP server (`netsol-smtp-oxcs.hostingplatform.com`):

| Trigger | Recipient | Template |
|---|---|---|
| User registration | New user | Email verification with token link |
| Donation confirmed | Donor | PDF certificate as attachment |
| Contact form submitted | Visitor | "We received your message" with copy |
| Contact form submitted | Admin | Notification with link to admin panel |
| Volunteer signup | Volunteer | "Thank you for volunteering" |
| Volunteer signup | Admin | Notification with link to admin panel |
| Admin replies to contact | Original submitter | Reply email |

All emails are sent via FastAPI `BackgroundTasks` so the user-facing
response is never blocked by SMTP latency.

---

## 8. Search Engine Optimization (SEO)

- Every page has a `SEOHead` component setting:
  - `<title>` (e.g. "Donate Zakat & Sadaqa Online | MyZakat – …")
  - `<meta name="description">`
  - Canonical URL
  - Open Graph + Twitter Card tags
- Site-wide JSON-LD `NonprofitOrganization` schema in the footer
- FAQ JSON-LD on the homepage
- Static `robots.txt` and `sitemap.xml` in `frontend/public/`

For AI/LLM discoverability:
- `frontend/public/llms.txt` — concise summary
- `frontend/public/llms-full.txt` — full feature documentation

---

## 9. Audit logging

Every state-changing request (POST/PUT/PATCH/DELETE) is logged with:
- Actor display name (extracted from JWT)
- Email
- Action description (human-readable, e.g. "uploaded a new gallery item")
- HTTP method, path, status code, duration, client IP

Logs flow to Loki via Promtail and are visualized in the
"MyZakat Activity" Grafana dashboard. See [MONITORING.md](MONITORING.md).

---

## 10. Out of scope (intentionally not implemented)

- Multi-currency donations (USD only)
- Multi-language UI (English only)
- ACH / bank transfer payments (Stripe Card only)
- In-app messaging between admin and users
- Mobile native apps (responsive web only)
- Public donor directory or leaderboard

---

## 11. Contact

For specification questions or proposed changes, contact:

**MyZakat – Zakat Distribution Foundation**
P.O. BOX 2250, Winchester, VA 22604
1-833-MYZAKAT · info@myzakat.org
