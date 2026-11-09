"""
The log event taxonomy.

These strings are an interface, not prose. They are matched by:

  - monitoring/grafana/dashboards/*.json   (panels and alerts)
  - scripts/logs.sh                        (VPS presets)

so renaming one silently blinds a dashboard. Add new events freely; change an
existing name only by updating those callers in the same commit. The test
suite asserts every name here is still emitted somewhere in the backend, which
catches an event that was renamed in code but not here.

Conventions
-----------
`<area>.<thing_that_happened>`, past tense, lower_snake.

Every payment event carries `outcome=success|failure`, so one query answers
"did donations work in the last hour" without enumerating event names:

    sum by (outcome) (count_over_time(
      {service="backend"} | logfmt | outcome != "" [1h]))

Failures additionally carry `reason=<short_stable_token>` — a bounded
vocabulary (see REASONS) rather than a raw exception string, so failures can be
grouped. The unbounded detail goes in `error=` and `stack=`.
"""

# ---------------------------------------------------------------------------
# Donations — the money path. Treat these as the highest-value log lines in
# the system; they are what the Donations dashboard is built on.
# ---------------------------------------------------------------------------

# A donor asked to pay and we handed Stripe a checkout session. Intent, not
# money: most sessions that are never paid are simply abandoned.
DONATION_SESSION_CREATED = "donation.session_created"

# We could not even create the session, so the donor saw an error and Stripe
# has no record. This is the event that was invisible during the www/CORS
# outage, because the request never reached the backend at all.
DONATION_SESSION_FAILED = "donation.session_failed"

# Money actually arrived and a Donation row exists. The success signal.
DONATION_SUCCEEDED = "donation.succeeded"

# Stripe told us the charge failed. Carries reason= (card_declined,
# insufficient_funds, ...) so failures can be grouped by cause.
DONATION_FAILED = "donation.failed"

# Donor reached Stripe Checkout and never completed it. Expected in volume;
# useful as a funnel denominator, not an error.
DONATION_ABANDONED = "donation.abandoned"

# Receipt PDF delivery. Separate from the donation itself: the money is safe
# even when the email is not, and conflating them hid failed receipts.
DONATION_CERTIFICATE_EMAILED = "donation.certificate_emailed"
DONATION_CERTIFICATE_FAILED = "donation.certificate_failed"

# Admin actions on donation records.
DONATION_RECORDED_MANUALLY = "donation.recorded_manually"
DONATION_UPDATED = "donation.updated"
DONATION_DELETED = "donation.deleted"

# ---------------------------------------------------------------------------
# Stripe webhooks — how we learn that anything above happened. When these
# break, donations silently stop being recorded even though donors paid, so
# they get their own events rather than hiding inside donation.*.
# ---------------------------------------------------------------------------
WEBHOOK_RECEIVED = "webhook.received"
WEBHOOK_PROCESSED = "webhook.processed"
WEBHOOK_DUPLICATE = "webhook.duplicate"      # Stripe retry we already handled
WEBHOOK_REJECTED = "webhook.rejected"        # bad signature or payload
WEBHOOK_FAILED = "webhook.failed"            # our handler raised

# ---------------------------------------------------------------------------
# Recurring donations.
# ---------------------------------------------------------------------------
SUBSCRIPTION_CREATED = "subscription.created"
SUBSCRIPTION_ACTIVATED = "subscription.activated"
SUBSCRIPTION_PAYMENT_RECORDED = "subscription.payment_recorded"
SUBSCRIPTION_CANCELLED = "subscription.cancelled"
SUBSCRIPTION_FAILED = "subscription.failed"

# ---------------------------------------------------------------------------
# Project proposals. Not money, but the decisions here commit money, so the
# review trail is worth being able to reconstruct from the log alone.
# ---------------------------------------------------------------------------
PROPOSAL_SUBMITTED = "proposal.submitted"      # first version of a new dossier
PROPOSAL_REVISED = "proposal.revised"          # a further version arrived
PROPOSAL_DECIDED = "proposal.decided"          # approved / rejected / changes_requested
PROPOSAL_SEEN = "proposal.seen"                # an admin opened the current version

# The funded -> report -> completed half of the lifecycle. These commit and then
# account for money, so the trail has to be reconstructable from the log alone.
PROPOSAL_FUNDED = "proposal.funded"            # the approved funds were released
REPORT_SUBMITTED = "report.submitted"          # the team filed a completion report
REPORT_DECIDED = "report.decided"              # accepted, or sent back for more
PROPOSAL_BLOCKED = "proposal.blocked"          # a new application refused: report outstanding
# An admin re-sent the email for the dossier's current status, by hand. Logged
# because "we told them" is a claim a dispute will rest on.
PROPOSAL_NOTIFICATION_RESENT = "proposal.notification_resent"
# An admin opened the submitter portal AS the applicant, to act for a team that
# cannot sign in. Every one is logged: it is the one path by which staff can
# file a report in a team's name.
PROPOSAL_PORTAL_OPENED_BY_STAFF = "proposal.portal_opened_by_staff"

# The funding agreement issued after approval.
AGREEMENT_SAVED = "agreement.saved"            # draft created or edited
AGREEMENT_ISSUED = "agreement.issued"          # PDF rendered and downloaded

# ---------------------------------------------------------------------------
# Sponsorship — families and orphans (migration 39). The case workflow, and
# the money path of a sponsorship, which mirrors the donation one: intent
# (checkout_created), commitment (started), each charge (payment_recorded),
# failure (payment_failed) and the end (ended).
# ---------------------------------------------------------------------------
SPONSORSHIP_CASE_SUBMITTED = "sponsorship.case_submitted"      # a new request was filed
SPONSORSHIP_CASE_RESUBMITTED = "sponsorship.case_resubmitted"  # applicant answered an info request
SPONSORSHIP_CASE_TRANSITIONED = "sponsorship.case_transitioned"  # any staff status change
SPONSORSHIP_CASE_EDITED = "sponsorship.case_edited"            # staff edited the dossier or profile
SPONSORSHIP_DOCUMENT_UPLOADED = "sponsorship.document_uploaded"
SPONSORSHIP_DOCUMENT_REVIEWED = "sponsorship.document_reviewed"
SPONSORSHIP_CHECKOUT_CREATED = "sponsorship.checkout_created"  # intent, not money
SPONSORSHIP_STARTED = "sponsorship.started"                    # first payment confirmed
SPONSORSHIP_PAYMENT_RECORDED = "sponsorship.payment_recorded"  # one monthly charge
SPONSORSHIP_PAYMENT_FAILED = "sponsorship.payment_failed"
SPONSORSHIP_ENDED = "sponsorship.ended"                        # by sponsor, staff, Stripe or case closure
SPONSORSHIP_DISBURSEMENT_RECORDED = "sponsorship.disbursement_recorded"
SPONSORSHIP_PORTAL_SIGNED_IN = "sponsorship.portal_signed_in"

SPONSORSHIP_EVENTS = (
    SPONSORSHIP_CASE_SUBMITTED, SPONSORSHIP_CASE_RESUBMITTED,
    SPONSORSHIP_CASE_TRANSITIONED, SPONSORSHIP_CASE_EDITED,
    SPONSORSHIP_DOCUMENT_UPLOADED, SPONSORSHIP_DOCUMENT_REVIEWED,
    SPONSORSHIP_CHECKOUT_CREATED, SPONSORSHIP_STARTED,
    SPONSORSHIP_PAYMENT_RECORDED, SPONSORSHIP_PAYMENT_FAILED,
    SPONSORSHIP_ENDED, SPONSORSHIP_DISBURSEMENT_RECORDED,
    SPONSORSHIP_PORTAL_SIGNED_IN,
)

# ---------------------------------------------------------------------------
# Everything else worth finding again.
# ---------------------------------------------------------------------------
AUTH_LOGIN = "auth.login"
AUTH_REGISTER = "auth.register"
REQUEST_FAILED = "request.failed"            # any 4xx/5xx, from the middleware
CONTENT_CHANGED = "content.changed"          # admin created/updated/deleted

# Outcome values. Kept to two so `outcome` stays a usable grouping key.
OUTCOME_SUCCESS = "success"
OUTCOME_FAILURE = "failure"

# ---------------------------------------------------------------------------
# Failure reasons. A bounded vocabulary so `sum by (reason)` produces a short,
# stable list instead of one bucket per exception message.
# ---------------------------------------------------------------------------
REASON_STRIPE_NOT_CONFIGURED = "stripe_not_configured"
REASON_STRIPE_ERROR = "stripe_error"
REASON_INVALID_AMOUNT = "invalid_amount"
REASON_CARD_DECLINED = "card_declined"
REASON_WEBHOOK_SECRET_MISSING = "webhook_secret_missing"
REASON_BAD_SIGNATURE = "bad_signature"
REASON_BAD_PAYLOAD = "bad_payload"
REASON_EMAIL_SEND_FAILED = "email_send_failed"
REASON_PDF_FAILED = "pdf_failed"
REASON_DB_ERROR = "db_error"
REASON_UNEXPECTED = "unexpected"

REASONS = (
    REASON_STRIPE_NOT_CONFIGURED, REASON_STRIPE_ERROR, REASON_INVALID_AMOUNT,
    REASON_CARD_DECLINED, REASON_WEBHOOK_SECRET_MISSING, REASON_BAD_SIGNATURE,
    REASON_BAD_PAYLOAD, REASON_EMAIL_SEND_FAILED, REASON_PDF_FAILED,
    REASON_DB_ERROR, REASON_UNEXPECTED,
)

# Every donation/payment event, for the dashboard and for tests.
PAYMENT_EVENTS = (
    DONATION_SESSION_CREATED, DONATION_SESSION_FAILED,
    DONATION_SUCCEEDED, DONATION_FAILED, DONATION_ABANDONED,
    DONATION_CERTIFICATE_EMAILED, DONATION_CERTIFICATE_FAILED,
    DONATION_RECORDED_MANUALLY, DONATION_UPDATED, DONATION_DELETED,
    WEBHOOK_RECEIVED, WEBHOOK_PROCESSED, WEBHOOK_DUPLICATE,
    WEBHOOK_REJECTED, WEBHOOK_FAILED,
    SUBSCRIPTION_CREATED, SUBSCRIPTION_ACTIVATED,
    SUBSCRIPTION_PAYMENT_RECORDED, SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_FAILED,
)

PROPOSAL_EVENTS = (
    PROPOSAL_SUBMITTED, PROPOSAL_REVISED, PROPOSAL_DECIDED, PROPOSAL_SEEN,
    PROPOSAL_FUNDED, REPORT_SUBMITTED, REPORT_DECIDED, PROPOSAL_BLOCKED,
    AGREEMENT_SAVED, AGREEMENT_ISSUED,
)

ALL_EVENTS = PAYMENT_EVENTS + PROPOSAL_EVENTS + SPONSORSHIP_EVENTS + (
    AUTH_LOGIN, AUTH_REGISTER, REQUEST_FAILED, CONTENT_CHANGED,
)
