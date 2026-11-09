# Sponsorship (families & orphans) and the Arabic site — design

Status: implemented in the same change set as this document. Sections marked
**Later** are deliberately out of the first delivery.

---

## Part 1 — Sponsor a family or an orphan

### 1.1 What we are building, in one paragraph

A donor chooses a verified family or orphan, commits a monthly amount, and
follows — without anyone learning who they are — what the money did. The family
(or the association that accompanies it) files a request with its documents,
follows it through review, and is told at each step what is happening. Staff
verify every claim and every document, decide, publish an anonymised profile,
record how the money was spent, and can reconstruct every action ever taken on
a dossier.

### 1.2 Actors

| Actor | Identity | Signs in with |
|---|---|---|
| **Applicant** — the family itself, an orphan's guardian, or a partner **association** | the email the request was filed under | six-digit code (same OTP machinery as proposals), no account |
| **Sponsor** — the donor | the email given at checkout | six-digit code, no account |
| **Staff** — admin / manager | `users` row | existing staff login |

There is deliberately no account for applicants or sponsors. The proposal
portal proved the model: the email *is* the identity, a code proves it, and
nobody has a password to forget. One email can be both an applicant and a
sponsor; the token is the same, the pages are not.

### 1.3 The core modelling decision: one case, two kinds

Families and orphans are **separate journeys** (separate forms, separate
listings, separate admin pages, separate sponsorships) but they share the whole
*machinery*: review workflow, documents, history, sponsorships, payments, use
of funds, updates to sponsors. Duplicating that machinery per kind would mean
two state machines that drift apart.

So the schema is class-table inheritance:

```
sponsorship_cases              ← one row per dossier, kind = family | orphan
 ├─ sponsorship_family_details ← 1:1 when kind = family
 │   └─ sponsorship_household_members (the household's composition)
 └─ sponsorship_orphan_details ← 1:1 when kind = orphan
       family_case_id → sponsorship_cases(id)   (optional link to a family)

sponsorship_case_documents     ← justificatifs, each with its own verification status
sponsorship_case_events        ← append-only history of EVERYTHING (the audit trail)
sponsorships                   ← one sponsor's monthly commitment to one case
donations.sponsorship_id       ← every charge is a Donation row (receipts, totals)
sponsorship_disbursements      ← what the money was spent on (use of funds)
sponsorship_case_updates       ← news posted to the case's sponsors
```

#### An orphan inside a registered family

The requirement: an orphan may belong to a family already on the platform;
no duplicates, no mixing of the two sponsorships.

* The orphan is **always its own case** (kind `orphan`), whether or not a family
  exists. Its sponsorship is its own.
* It may point at its family with `family_case_id`. The family is never copied
  into the orphan record and vice versa.
* **Budgets do not overlap by rule**: a family's monthly need covers
  household-level costs (rent, food, utilities); an orphan's covers what is
  personal to the child (schooling, clothing, health, personal food share). The
  forms say so, the admin review shows the two side by side, and the family
  page links to its orphans ("2 children of this family can also be sponsored")
  without ever adding their amounts to its own.
* Linking is possible at three moments: the applicant files an orphan from
  inside their portal under one of their families; the applicant types a family
  reference on the public form (accepted only if that family was filed from the
  same email — otherwise flagged for staff); or staff link/unlink at any time.
  Every link and unlink is an event.
* **Duplicate detection** runs on every submission: same national ID of the
  household head / guardian, same phone, or (orphans) same child name + birth
  date. A match does not block — families do get re-filed by a second
  association — it raises a visible *possible duplicate* flag with the other
  references, which staff must clear or confirm.

### 1.4 Lifecycle (state machine)

```
            ┌──────────────── info_requested ◄─────┐
            ▼                     │ (applicant      │
 submitted ──► under_review ──────┘  resubmits)    │
     │             │  │                            │
     │             │  └──► rejected (terminal, reopenable by staff)
     │             ▼
     │          approved ──► published ◄──► paused
     │                           │
     └───────────────────────────┴──────► closed (reason) ── reopen ─► under_review
```

| Status | Meaning | Visible to donors |
|---|---|---|
| `submitted` | filed, nobody has started | no |
| `under_review` | a reviewer is verifying it | no |
| `info_requested` | sent back to the applicant with a message (and the documents asked for) | no |
| `approved` | facts verified; the public profile is being prepared | no |
| `published` | listed, can be sponsored | **yes** |
| `paused` | temporarily hidden (situation being re-checked); existing sponsorships continue | no |
| `rejected` | not eligible; reason told to the applicant | no |
| `closed` | ended: aged out, self-sufficient, moved, duplicate, deceased, other | no |

Rules enforced in `sponsorship_service.TRANSITIONS`, never in a router:

* **Publish** requires: an approved monthly amount, a public title and story,
  publication consent from the applicant, and every *required* document
  verified (family: head's ID; orphan: birth certificate and the parent's death
  certificate). The admin sees exactly which precondition is missing.
* **Approve** requires every required document verified.
* **Close with active sponsorships** requires an explicit decision: the Stripe
  subscriptions are cancelled and each sponsor is emailed. Nothing is left
  charging a donor for a case that no longer exists.
* An orphan **cannot be filed at 18 or over**. The dashboard warns 90 days
  before a sponsored orphan turns 18.
* Funding is **not a status**. "Fully sponsored" is derived from the active
  sponsorships' monthly sum against the approved need, because it changes with
  every payment failure and cancellation. Deriving it means it can never be
  stale.

### 1.5 Sponsorship rules

* Monthly, by Stripe subscription (mode `subscription`, inline recurring price).
  Every successful charge becomes a normal `donations` row carrying
  `sponsorship_id`: the existing receipt PDF, donation totals and admin
  donation list keep working untouched.
* **Full or shared.** The primary choice is to cover the whole remaining need;
  a donor may instead give a share (minimum $10/month). A case can therefore
  have several sponsors, each anonymous to the others.
* **No over-funding by accident.** The amount offered can never exceed what is
  still uncovered, counting the active commitments *and* checkouts opened in the
  last 30 minutes (Stripe checkout sessions are created with a 30-minute expiry,
  so a reservation cannot outlive its session). A race that still overfunds is
  accepted — refusing money already taken would be worse — and flagged on the
  dashboard for staff to redirect.
* Statuses: `pending` (checkout opened) → `active` → `past_due` (a charge
  failed; Stripe retries) → `canceled` / `ended` (by the sponsor, by staff, or
  because the case closed). `abandoned` when the checkout expired unpaid.
* The sponsor can stop at any time from their space (cancel at period end, with
  an optional reason). Staff see churn and its reasons.

### 1.6 Privacy and dignity

The single most important rule: **the public profile is a separate, curated
set of fields** written or approved by staff, not a projection of the dossier.

| Never public | Public (curated) |
|---|---|
| full names, national IDs, phone, address, documents, guardian details, exact birth date, sponsor identity | a reference code (`F-7K3Q9P`, `O-4M2XHT` — random, not sequential), a display name (first name or pseudonym), age in years, country and region, household size, the needs breakdown, a staff-written story (EN + AR), a photo **only** when the applicant consented and staff marked it safe |

* Sponsors are anonymous to the beneficiary and to the public: the family sees
  "your family is sponsored for $X a month since …", never by whom.
* Reference codes are random so the listing leaks neither volume nor order.
* Applicant consent is recorded with its exact wording and timestamp, separately
  for *verification* (mandatory) and *publication* (mandatory to be published).
* Documents are only ever served to staff and to the applicant who uploaded
  them; never through a public URL.
* Updates to sponsors are written by staff; a photo in an update is the staff
  member's explicit "this photo does not identify the child/family" decision.

### 1.7 Transparency for the donor

On each case a sponsor sees, without ever seeing private data:

1. **Verification** — "Documents verified by MyZakat on <date>" with the *kinds*
   of documents verified (not the documents).
2. **Money in** — every charge with its receipt.
3. **Money out** — every disbursement: date, category (food, rent, education,
   health, clothing, utilities, other), amount, a short public description.
4. **Balance** — received for this case vs distributed, so a sponsor can see
   funds are not sitting idle.
5. **Updates** — staff-written news ("passed to 5th grade", "winter supplies
   delivered").

### 1.8 Journeys

**Donor**

1. `/sponsor` — how it works in three steps, the privacy promise, two doors:
   *Sponsor an orphan* / *Sponsor a family*, live counts.
2. `/sponsor/orphans`, `/sponsor/families` — cards with display name, age,
   region, monthly need, coverage bar, "waiting since". Default order: those
   **waiting longest** first (fairness), filter by country, age, gender, and
   "still needs a sponsor" on by default.
3. `/sponsor/<ref>` — the profile: story, needs breakdown, verification badge,
   linked family / siblings, and the sponsorship box (full / share, monthly).
4. Stripe Checkout → `/sponsor/thank-you` — what happens now, link to their space.
5. `/my-sponsorships` — code sign-in; per sponsorship: profile, since, total
   given, payments, use of funds, updates; stop the sponsorship.

**Family / association**

1. `/sponsor/apply` — two doors: a family, an orphan. What you will need
   (document checklist) *before* starting, so nobody gets stuck at step 5.
2. A guided multi-step form (5 steps), documents attached in the last step, two
   consents. Required documents may be sent later: missing ones are listed in
   the applicant's space and on the admin checklist, so a family without a
   scanner today is not turned away.
3. Confirmation with the reference and how to follow it.
4. `/my-requests` — code sign-in; per case: a status timeline in plain words,
   the reviewer's message when information is requested, what documents are
   missing or were refused (and why), upload more, edit and resubmit; once
   published, sponsorship status and what was distributed. An association sees
   all its cases and can file an orphan under one of its families.
5. Emails at each step: received, information requested, approved, published,
   first sponsor found, rejected, closed.

**Staff**

* **Overview** — pipeline counts per status (with an unread badge for new and
  resubmitted cases), coverage (published cases fully / partly / not
  sponsored), monthly need vs monthly committed, active sponsors, new
  sponsorships and cancellations this month, past-due sponsorships, collected
  vs disbursed this month, average review time, average wait for a sponsor,
  and *alerts*: documents awaiting verification, possible duplicates,
  over-funded cases, orphans turning 18 within 90 days, sponsored cases with no
  update for 90 days, funds received but not distributed for 60 days.
* **Families** and **Orphans** — two lists (same component, different kind),
  filter by status / funding / flags, search by reference, name or email.
* **Case page** — one page, tabs:
  *Overview* (facts, status, next action, the one button that matters) ·
  *Dossier* (everything filed; staff edits are logged field by field) ·
  *Documents* (verify / refuse each, with a reason) ·
  *Public profile* (EN/AR editor with a live preview of the public card) ·
  *Sponsorships* (who, how much, since, status, payments) ·
  *Funds* (collected, disbursed, balance; record a disbursement) ·
  *Updates* (post to sponsors) ·
  *History* (every event, filterable, with actor and diff) ·
  *Links* (family ↔ orphans, duplicate flags).
* Every action asks for a reason where one matters (reject, request info,
  close, refuse a document) and writes an event.

### 1.9 Traceability

`sponsorship_case_events` is append-only and records: who (staff user id and
email, applicant email, sponsor email masked, or `system`), what (`type`), the
status before and after, a message shown to the applicant (if any), an internal
note (staff only), and for edits a field-level `changes` diff `{field: [old,
new]}`. It is written by the service layer in the same transaction as the
change it describes, so a change without its event cannot exist. It is never
updated or deleted by the application.

Three visibility levels on each event: `internal` (staff only), `applicant`
(shown in the applicant's timeline) and `sponsor` (shown to the case's
sponsors). The applicant's timeline is a filter on the same table — not a
second log that could disagree with the first.

Operational logs follow the logfmt taxonomy (`sponsorship.*` events in
`log_events.py`), so Grafana can count submissions, decisions, sponsorships
started/ended and failed charges.

### 1.10 API surface

```
Public       GET  /api/sponsorship/stats
             GET  /api/sponsorship/cases?kind=&country=&...       published only, public fields only
             GET  /api/sponsorship/cases/{ref}
             POST /api/sponsorship/cases/{ref}/checkout           → Stripe session id
             POST /api/sponsorship/apply/{kind}                   multipart: payload JSON + documents

Portal       POST /api/sponsorship/portal/request-code            {email, audience: applicant|sponsor}
             POST /api/sponsorship/portal/verify-code
             GET  /api/sponsorship/portal/requests                applicant's cases
             PUT  /api/sponsorship/portal/requests/{id}           edit + resubmit (info_requested only)
             POST /api/sponsorship/portal/requests/{id}/documents
             GET  /api/sponsorship/portal/requests/{id}/documents/{doc_id}
             GET  /api/sponsorship/portal/sponsorships            sponsor's sponsorships
             POST /api/sponsorship/portal/sponsorships/{id}/cancel

Admin        GET  /api/sponsorship/admin/overview
             GET  /api/sponsorship/admin/cases?kind=&status=&...
             GET  /api/sponsorship/admin/cases/{id}
             PATCH /api/sponsorship/admin/cases/{id}              dossier / profile edits (diffed)
             POST /api/sponsorship/admin/cases/{id}/transition    {action, message, note, ...}
             POST /api/sponsorship/admin/cases/{id}/documents/{doc_id}/review
             POST /api/sponsorship/admin/cases/{id}/link          {family_case_id | null}
             POST /api/sponsorship/admin/cases/{id}/disbursements
             POST /api/sponsorship/admin/cases/{id}/updates
             POST /api/sponsorship/admin/cases/{id}/notes
             GET  /api/sponsorship/admin/sponsorships
             POST /api/sponsorship/admin/sponsorships/{id}/cancel
```

Stripe: the existing webhook gains sponsorship hooks — checkout completed
activates the pending sponsorship; each paid invoice is recorded as a Donation
tagged with the sponsorship (created by the hook itself when the generic
subscription row has not arrived yet, which the generic path silently drops);
a failed invoice marks it past due; a deleted subscription ends it.

### 1.11 Later

* Stripe customer portal for card changes (needs Stripe dashboard config).
* Sponsor → beneficiary moderated messages.
* Annual sponsor report PDF.
* Multi-currency.
* Field-staff role writing disbursements from the media workspace.

---

## Part 2 — The Arabic site

### 2.1 Principles

* **A real adaptation, not a string swap**: right-to-left layout, mirrored
  directional icons, an Arabic typeface with proper line height, no letter
  spacing on Arabic (it breaks cursive joining), Arabic number and date
  formatting, Arabic-first copy for Islamic terms (زكاة، صدقة، كفالة اليتيم) and
  a register appropriate to a charity (respectful, warm, not machine-literal).
* **Its own URLs**: `/ar/...`. Shareable, indexable, with `hreflang` alternates
  both ways and an `x-default`. A language preference is remembered, and an
  Arabic browser is *offered* the Arabic site (a banner), never force-redirected.
* **No mixed half-pages**: a page that has not been translated yet renders its
  English content left-to-right inside the Arabic chrome, under a one-line note
  saying so, instead of a broken mixture.
* The admin console stays English (staff tool); `/ar/admin` redirects to `/admin`.

### 2.2 Mechanics

* `main.tsx` reads the locale from the first path segment and mounts the router
  with `basename="/ar"`. Every existing `<Link to="/donate">` therefore resolves
  to `/ar/donate` without being touched. Switching language is a full navigation
  to the same path under the other prefix.
* `<html lang dir>` is set before first paint.
* Messages are colocated with the component that uses them:
  `const M = defineMessages({ title: { en: '…', ar: '…' } })`, read with
  `t(M.title, vars)`. Shared chrome strings live in `i18n/common.ts`. A
  two-language site does not need a key catalogue, and colocation means a page
  and its translation can never drift apart in separate files.
* Layout: physical Tailwind utilities (`ml-`, `pr-`, `left-`, `text-left`…) are
  replaced by logical ones (`ms-`, `pe-`, `start-`, `text-start`…), which are
  identical in LTR and correct in RTL. Directional lucide icons are mirrored by
  one CSS rule on their class. `space-x-*` is reversed under `dir=rtl`.
* Money and dates go through `useFormat()` (`Intl` with `ar-u-nu-latn`: Arabic
  text, Western digits — the convention for amounts across the Maghreb and on
  most Arabic payment pages, and unambiguous for a US-dollar charity).
* Dynamic content (stories, programs…) stays as entered; sponsorship profiles
  carry an Arabic story field from day one. **Later**: `_ar` fields on the other
  content types.
