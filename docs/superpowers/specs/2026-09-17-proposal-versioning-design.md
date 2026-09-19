# Project Proposal Versioning & Submitter Portal — Design

**Date:** 2026-09-17
**Status:** Approved for planning

## Summary

Project proposals currently live as a single mutable row per submission. Admins
can change the status and attach a private note, but the submitter is never
told, has no way to see where their file stands, and has no way to revise it —
the only path is submitting a brand new proposal, which loses the link to the
original.

This design turns a proposal into a **dossier with an append-only chain of
versions**. Admins accept, reject, or request changes; every decision is
recorded on the exact version it applies to, and that version is then immutable.
The submitter is notified by email at every step, and reaches a passwordless
portal — email plus a six-digit code — where they see the status of each of
their proposals and revise the ones the reviewer sent back.

## Goals

- Full, permanent history per proposal: content, submission date, decision,
  the comment shown to the submitter, and the reviewer's private note.
- Admins can accept, reject, or request changes, with a message to the applicant.
- Every submission and every decision emails the submitter.
- Submitters revise and resubmit a proposal that was sent back for changes; the
  revision becomes a new version, not a new dossier.
- Submitters reach a secure space without owning an account.
- The submitter portal cannot, under any circumstance, reach staff endpoints.

## Non-goals

- Emailing staff when a new proposal or revision arrives.
- Showing the submitter their own version history (they see the current state
  and the reviewer's latest comment only).
- Starting a brand new proposal from inside the portal — the public form stays
  the entry point.
- A visual diff between two versions.
- Changing a dossier's email. Neither the submitter nor the admin UI exposes
  it in this iteration; a genuine address change is a database operation.

## Current state

- `backend/models.py:594` — `ProjectProposal`: one row per submission carrying
  all four form sections (~25 content columns), `status` in
  `submitted | under_review | approved | rejected`, a single admin-only
  `admin_notes`, `reviewed_at` / `reviewed_by`, `submitted_ip`, and three
  `sms_consent_*` columns for 10DLC proof of opt-in.
- `backend/routers/project_proposals.py` — public `POST /`, then
  list / get / `PATCH {id}/status` / `DELETE` / `GET {id}/pdf` behind
  `get_current_manager_or_admin`. No email is ever sent to the submitter. The
  file also holds `_render_proposal_pdf`, a reportlab renderer that reads
  attributes off the proposal object.
- `ProjectProposal` is referenced nowhere else in the backend — the blast
  radius of reshaping it is one router.
- `frontend/src/pages/SubmitProposal.tsx` — 604 lines: a four-step form, its
  validation table (`MIN_LEN`, `FIELD_INFO`), Pydantic error humanisation, and
  the `Field` / `CharCount` helpers, all in the page. It calls the API with raw
  `fetch`, not the shared axios client.
- `frontend/src/pages/admin/AdminProjectProposals.tsx` — 390 lines: list,
  detail drawer, status change, PDF download.
- `backend/email_service.py` — thin shims over `marketing.mailer.enqueue_email`,
  which renders a Jinja template pair from `backend/email_templates/` and queues
  delivery through Resend/Arq. Templates are plain files; nothing is registered
  in the database.
- `backend/auth_utils.py:66` — `verify_token()` returns the `sub` claim, and
  `get_current_user` resolves it by `User.email == sub`. Any validly signed
  token whose subject matches a staff email authenticates as that staff member.
- No rate limiting anywhere in the project (no slowapi, no middleware).
- `frontend/src/utils/api.ts:44` — a request interceptor attaches
  `localStorage.auth_token` to **every** call through the shared client, and the
  401 handler clears that token and redirects.
- No tests exist for project proposals, backend or E2E.

## Decisions

| Question | Decision |
|---|---|
| `rejected` vs `changes_requested` | `rejected` closes the dossier — not editable by the submitter. `changes_requested` is the editable state. An admin can reopen a rejected dossier by moving it back to `changes_requested`. |
| Versioning shape | Append-only `proposal_versions` table holding the content. `project_proposals` becomes the dossier: identity, current status, pointer to the current version. |
| What the portal offers | List of the submitter's dossiers with status and the reviewer's comment; edit and resubmit when `changes_requested`. |
| Editable fields on revision | All four sections except `email`, which is the dossier's identity key and the portal's access key. |
| Email notifications | Acknowledgement on every submission (v1 included), plus one on each of the three decisions. |
| Portal access | Six-digit one-time code sent by email, exchanged for a short-lived scoped token. No magic links. |
| Reviewer comments | Two fields: `decision_comment`, shown to the submitter and quoted in the email, and `internal_note`, staff-only. |

### Rationale for append-only versions

The alternative — keeping the latest content on `project_proposals` and
archiving superseded copies — needs no migration, but splits one logical
history across two tables: the admin history view becomes a UNION, and every
future change to the form has to be mirrored in both schemas. Putting the
content in one append-only table makes "the complete history" a single ordered
query, lets any version render its own PDF with no special case, and confines
future form changes to one table. The cost is a one-off migration of existing
rows, which is cheap: the feature shipped in migration 29 and holds little data.

A JSONB snapshot column was also considered. It survives form evolution without
DDL, but drops typing and indexing on the content and breaks with the typed-column
style used throughout the project, including the PDF renderer's attribute access.

### Rationale for splitting the reviewer's comment in two

`admin_notes` is staff-only today. The same text is now going out by email, so
keeping one field would mean either exposing internal notes to applicants or
losing the ability to write any. Two fields cost one extra textarea in the
decision modal.

## Data model

### Migrations `32_proposal_versioning.sql` and `33_drop_proposal_content_columns.sql`

**`project_proposals` becomes the dossier.** It keeps only what is stable
across versions:

| Column | Note |
|---|---|
| `id` | unchanged — the dossier reference already printed on PDFs |
| `email` | identity key, indexed. Set once at first submission and never changed by the application |
| `full_name` | denormalised from the current version for the admin list; rewritten on every new version |
| `status` | `submitted \| under_review \| changes_requested \| approved \| rejected` |
| `current_version_id` | FK → `proposal_versions.id`, `ON DELETE SET NULL` |
| `submitted_at` | first submission |
| `updated_at` | last activity of any kind |
| `reviewed_at`, `reviewed_by` | last decision, for admin sorting |

Dropped from this table: the ~25 content columns, `submitted_ip`, `admin_notes`,
and the three `sms_consent_*` columns. They move into the version.

**`proposal_versions` — append-only.** A version is written once on submission
and once more when its decision is recorded; after that it is never touched.

| Column | Note |
|---|---|
| `id` | |
| `proposal_id` | FK, `ON DELETE CASCADE` |
| `version_no` | 1-based, `UNIQUE (proposal_id, version_no)` |
| all 25 section 1–4 content columns | same names, types and `NOT NULL`ness as today, so the PDF renderer keeps working on a version object |
| `submitted_at`, `submitted_ip` | this version's own submission |
| `sms_consent`, `sms_consent_at`, `sms_consent_text` | 10DLC proof belongs to the submission act, not the dossier |
| `decision` | `NULL` (awaiting review) `\| approved \| rejected \| changes_requested` |
| `decision_comment` | shown to the submitter, quoted in the email |
| `internal_note` | staff-only |
| `decided_at`, `decided_by` | FK → `users.id`, `ON DELETE SET NULL` |

Index on `(proposal_id, version_no)`.

**`proposal_access_codes` — one-time codes.**

| Column | Note |
|---|---|
| `id` | |
| `email` | indexed together with `created_at` for rate-limit queries |
| `code_hash` | bcrypt, via the existing `get_password_hash`. The code is never stored or logged in clear |
| `created_at`, `expires_at` | 10-minute lifetime |
| `consumed_at` | single use |
| `attempts` | burned at 5 |
| `request_ip` | for the per-IP rate limit |

### Backfilling existing rows

Each existing `project_proposals` row produces its version 1: content,
`submitted_ip` and consent columns copied across; `admin_notes` moved to
`internal_note`; `decision` derived from the current status (`approved` /
`rejected` keep their decision, `submitted` / `under_review` stay `NULL`);
`decided_at` / `decided_by` from `reviewed_at` / `reviewed_by`. Then
`current_version_id` is set and the content columns are dropped.

The backfill is an `INSERT … SELECT` inside the migration, not a Python script:
it is then atomic with the DDL that precedes it, and guarded by
`current_version_id IS NULL` so re-running it changes nothing. The pytest suite
builds its schema from `Base.metadata.create_all` and never replays the SQL
migrations, so a unit test of a Python backfill would not exercise what actually
runs in production; the migration is verified instead against the Postgres
container with a seeded legacy row.

The column drop is a second migration, applied after the new code is deployed —
the previous image still writes those columns, and the new one cannot insert a
dossier while they are still NOT NULL. The first migration therefore also
relaxes them.

## Lifecycle

```
[public]   POST /                      → dossier + version 1, status = submitted
[admin]    under_review                  optional, marks that review has begun (no email)
[admin]    approved                      terminal (email)
[admin]    rejected                      terminal, not editable (email + reason)
[admin]    changes_requested             editable (email + requested changes)
[portal]   PUT /portal/{id}            → version N+1, status back to submitted
[admin]    rejected → changes_requested  manual reopening of a closed dossier
```

The decision is always written on the **current** version. A version that
already carries a decision is never rewritten — the API rejects any attempt.

## API

All paths under `/api/project-proposals`.

### Public and portal

| Route | Behaviour |
|---|---|
| `POST /` | Unchanged request contract. Creates the dossier and version 1. Response gains `version_no`. One email may own several dossiers: this route always opens a new one, never a version of an existing dossier. |
| `POST /portal/request-code` | `{email}` → always `202` with an identical body whether or not a dossier exists, so the endpoint cannot be used to enumerate applicants. Invalidates that email's unconsumed codes. Past the rate limit the reply is that same `202` — no email is sent, and nothing distinguishes the case. |
| `POST /portal/verify-code` | `{email, code}` → `{token, expires_in}`. Increments `attempts`; burns the code at 5. |
| `GET /portal/me` | Portal token. The dossiers for that email: `id`, `project_name`, `status`, `submitted_at`, `updated_at`, latest `decision_comment`, `editable`, and the current version's content for form prefill. |
| `PUT /portal/{id}` | Portal token. Creates version N+1 and returns the dossier to `submitted`. `409` if the status is not `changes_requested`. Any `email` in the payload is ignored in favour of the dossier's. |

### Admin (`get_current_manager_or_admin`, unchanged)

| Route | Behaviour |
|---|---|
| `GET /` | Same response shape as today — the current version's content is flattened into each item, so the existing page keeps working — plus `version_count` and `current_version_no`. `status_filter` accepts `changes_requested`. |
| `GET /{id}` | Dossier + current version content + `versions[]`: `version_no`, `submitted_at`, `decision`, `decision_comment`, `internal_note`, `decided_at`, `decided_by`. |
| `GET /{id}/versions/{n}` | One version's full frozen content. |
| `PATCH /{id}/status` | Accepts `status`, `decision_comment`, `internal_note`. Writes the decision onto the current version, updates the dossier, and queues the email. `decision_comment` is required for `rejected` and `changes_requested`. |
| `GET /{id}/pdf` | Current version. |
| `GET /{id}/versions/{n}/pdf` | That version, rendered from its frozen content. |
| `DELETE /{id}` | Cascades to versions. |

## Portal authentication

**Code.** Six digits from `secrets`, bcrypt-hashed at rest, ten-minute lifetime,
single use, five attempts. Requesting a new code invalidates the previous
unconsumed ones for that email.

**Rate limits**, enforced in the database against `proposal_access_codes`:
three codes per email per 15 minutes, ten per IP per hour. Over the limit the
response is indistinguishable from every other: the same `202` and the same
opaque body, with no email sent. A `429` was considered and rejected — it could
only ever be served to an address that has a dossier, so it would have turned
three unauthenticated posts into a test for "has this person applied for
funding?", defeating the opaque reply this endpoint is built around.

**Token.** `{sub: <email>, typ: "proposal_portal", exp: +30 min}`, signed with
the existing secret.

**The mandatory auth fix.** `verify_token()` returns `None` whenever a `typ`
claim is present and is not `"user"`. Without it, a portal token minted for
`admin@myzakat.org` would satisfy `get_current_user` and open the admin
console. A new `get_portal_email()` dependency enforces the mirror condition:
`typ` must equal `"proposal_portal"`. The two token families become mutually
unusable, and tests assert both directions.

**Data isolation.** Portal routes always filter on `email == token.sub`. An
`id` belonging to someone else returns `404`, not `403`. The portal serialiser
is a separate function from the admin one: `internal_note`, `submitted_ip`,
`reviewed_by` and `decided_by` never appear in a portal response.

## Emails

Five new template pairs (`.html` + `.txt`) in `backend/email_templates/`,
following the existing layout convention, each with a shim in
`backend/email_service.py`.

| Template | Trigger | Content |
|---|---|---|
| `proposal_received` | every submission, v1 included | acknowledgement, dossier and version number |
| `proposal_changes_requested` | decision | `decision_comment`, link to `/my-proposals`, how the code login works |
| `proposal_rejected` | decision | the reason, no edit link |
| `proposal_approved` | decision | confirmation |
| `proposal_access_code` | code request | the six digits, validity, and a warning to ignore it if unexpected |

All queued with `category="transactional"`, so they respect the suppression
list but not marketing unsubscribes. Decision and acknowledgement emails carry
an idempotency key of `proposal-{id}-v{n}-{event}`, so a double click in the
admin UI cannot send twice.

## Frontend

**Form extraction, done first.** The four sections, the validation table, the
Pydantic error humanisation and the `Field` / `CharCount` helpers move out of
`SubmitProposal.tsx` into `components/proposals/ProposalForm.tsx`, driven by a
`mode: 'create' | 'revise'` prop. In `revise` mode it takes initial values from
the current version and renders the email field read-only. This is what keeps a
25-field form from being duplicated; the public page becomes a thin shell around
it.

**`pages/MyProposals.tsx`** — three states: email entry → code entry → dashboard.
The dashboard is one card per dossier (project name, status badge, dates,
reviewer comment) with a *Fix and resubmit* action shown only when `editable`.
Route `/my-proposals`, linked from the footer and from the post-submission
confirmation screen.

**`utils/proposalPortalApi.ts`** — its own axios instance, token in
`sessionStorage` under a dedicated key, its own 401 handler. It never touches
`auth_token`, and the shared client's interceptor never sees a portal request.

A 30-minute token can expire while a 25-field form is being filled in, so a 401
on `PUT` must not discard the work: the form stays mounted with its values and
the code step is shown inline over it. Once a fresh token is obtained, the same
values are submitted again.

**Admin** — `changes_requested` added to the status filter and badges. A new
*Version history* panel renders a timeline (v3 awaiting review, v2 changes
requested on …, v1 …); each entry expands to that version's frozen content and
offers its PDF. The decision modal gains two distinct fields, *Message to the
applicant* and *Internal note*, the first required for `rejected` and
`changes_requested`.

## Testing

**Backend** — `tests/test_project_proposals.py` and
`tests/test_proposal_portal.py` (nothing exists today):

- Version chain: v1 on submission, v2 on revision, `current_version_id` follows.
- `409` on a revision when the status is not `changes_requested`.
- The dossier's email cannot be changed through the portal payload.
- A version that already carries a decision cannot be rewritten.
- OTP: happy path, expiry, reuse, attempt cap, rate limit, and identical
  responses for known and unknown emails.
- A portal token is rejected by every admin route; a staff token is rejected by
  every portal route.
- Cross-email access returns `404`.
- `internal_note` never appears in a portal response.
- PDF of an earlier version renders that version's content.
**Migration** — verified against the Postgres container rather than in pytest,
for the reason given under "Backfilling existing rows": a seeded legacy row must
yield a complete version 1 with a consistent pointer, the migration must be
re-runnable without changing anything, and a dossier row must be insertable
without any content column.

**E2E** — `e2e/proposal-versioning.spec.ts`: submit → admin requests changes →
portal login with the code read from the database by a fixture → revise →
resubmit → admin sees two versions and both decisions in the history.

## Files touched

| Path | Change |
|---|---|
| `migrations/32_proposal_versioning.sql` | new: two tables, pointer, backfill, NOT NULL relaxation |
| `migrations/33_drop_proposal_content_columns.sql` | new: drops the legacy columns, after the deploy |
| `backend/models.py` | reshape `ProjectProposal`; add `ProposalVersion`, `ProposalAccessCode` |
| `backend/auth_utils.py` | `typ` claim check in `verify_token`; new `get_portal_email` |
| `backend/proposal_service.py` | new: dossiers, versions, decisions, serializers |
| `backend/proposal_pdf.py` | new: the reportlab renderer, moved out of the router |
| `backend/proposal_otp.py` | new: one-time codes and their rate limits |
| `backend/routers/project_proposals.py` | versioned read/write and decisions; thin over the service |
| `backend/routers/proposal_portal.py` | new: the submitter-facing endpoints |
| `backend/email_service.py` | five shims |
| `backend/email_templates/proposal_*.{html,txt}` | new: five pairs |
| `frontend/src/components/proposals/ProposalForm.tsx` | new: extracted form |
| `frontend/src/pages/SubmitProposal.tsx` | reduced to a shell |
| `frontend/src/pages/MyProposals.tsx` | new: portal |
| `frontend/src/utils/proposalPortalApi.ts` | new: isolated client |
| `frontend/src/pages/admin/AdminProjectProposals.tsx` | version history, two-field decision modal |
| `frontend/src/App.tsx`, `components/Footer.tsx` | route and link |
| `backend/tests/test_project_proposals.py`, `test_proposal_service.py`, `test_proposal_portal.py`, `test_proposal_otp.py`, `test_proposal_emails.py` | new |
| `e2e/proposal-versioning.spec.ts` | new |

## Risks

- **Migration is destructive by nature** — it drops content columns from
  `project_proposals`. It runs in a transaction and is preceded by a database
  backup; the backfill is verified by test before the drop statements execute.
- **The `typ` claim change touches every authenticated route.** Existing staff
  tokens carry no `typ`, so they keep working by design; the test suite for
  `test_auth.py` must pass untouched.
- **`GET /` response shape** is preserved deliberately so the admin page keeps
  rendering during the rollout, at the cost of flattening the current version
  into each list item.
