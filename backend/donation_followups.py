"""Failed and abandoned donations: why they failed, and the email that offers help.

Two jobs live here:

1. explain_failure() turns what Stripe told us into one plain-English line for
   staff, so the admin list says "The card has expired" instead of a code.

2. The follow-up email. When a donor tries to give and the payment does not go
   through, we thank them for the intention and offer personal help to finish
   it. The webhook only *schedules* it (schedule_followup); the worker sends it
   after FOLLOWUP_DELAY (process_due_followups), because most declined donors
   retry with another card within minutes, and a "can we help?" email landing
   after they already succeeded would be noise. At send time we skip it when:
     - the donor has completed a donation since the failure (not_needed), or
     - the donor was already sent one in the last FOLLOWUP_COOLDOWN (skipped):
       three declined cards in a row, or a decline followed a day later by the
       expired checkout session, must produce one email, not four.

Only rows the webhook scheduled are ever emailed. Rows from before this
feature, or pulled in by the Stripe sync, have followup_status NULL and are
left alone.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

import log_events as ev
from logging_config import get_logger, mask_email

logger = get_logger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://myzakat.org")

FOLLOWUP_DELAY = timedelta(minutes=int(os.getenv("DONATION_FOLLOWUP_DELAY_MINUTES", "60")))
FOLLOWUP_COOLDOWN = timedelta(days=int(os.getenv("DONATION_FOLLOWUP_COOLDOWN_DAYS", "7")))

FOLLOWUP_FROM_EMAIL = os.getenv("DONATION_FOLLOWUP_FROM_EMAIL", "nhdieb@myzakat.org")
FOLLOWUP_FROM_NAME = os.getenv("DONATION_FOLLOWUP_FROM_NAME", "Naser Hdieb - MyZakat")
FOLLOWUP_PHONE = os.getenv("DONATION_FOLLOWUP_PHONE", "+1 (571) 243-0710")

SCHEDULED, SENT, NOT_NEEDED, SKIPPED = "scheduled", "sent", "not_needed", "skipped"

CHECKOUT_EXPIRED = "checkout_expired"
CHECKOUT_LIFETIME = timedelta(hours=24)  # Stripe's default, and its maximum

# Staff-facing. Keys are Stripe failure / decline codes and Radar outcome reasons.
_EXPLANATIONS = {
    CHECKOUT_EXPIRED: "The donor opened the Stripe payment page and left without paying. "
                      "Stripe closed the session when it expired. No card was charged.",
    "insufficient_funds": "The card does not have enough funds.",
    "expired_card": "The card has expired.",
    "incorrect_cvc": "The security code (CVC) was wrong.",
    "invalid_cvc": "The security code (CVC) was wrong.",
    "incorrect_number": "The card number was wrong.",
    "invalid_number": "The card number was wrong.",
    "invalid_expiry_month": "The expiry date was wrong.",
    "invalid_expiry_year": "The expiry date was wrong.",
    "incorrect_zip": "The postal / ZIP code did not match the card.",
    "authentication_required": "The bank asked for an extra verification step (3-D Secure) that was not completed.",
    "payment_intent_authentication_failure": "The bank's verification step (3-D Secure) failed or was cancelled.",
    "card_velocity_exceeded": "The card hit its spending limit, or too many attempts were made.",
    "withdrawal_count_limit_exceeded": "The card hit its spending limit.",
    "generic_decline": "The bank declined the card without giving a reason. The donor should call their bank or use another card.",
    "card_declined": "The bank declined the card without giving a reason. The donor should call their bank or use another card.",
    "do_not_honor": "The bank declined the card without giving a reason. The donor should call their bank or use another card.",
    "call_issuer": "The bank declined the card and asks the cardholder to call them.",
    "transaction_not_allowed": "The bank does not allow this kind of payment on this card.",
    "card_not_supported": "This card does not support this kind of payment.",
    "currency_not_supported": "The card does not support payments in US dollars.",
    "processing_error": "An error occurred while processing the card. Trying again usually works.",
    "try_again_later": "The bank had a temporary problem. Trying again usually works.",
    "issuer_not_available": "The bank could not be reached. Trying again usually works.",
    "lost_card": "The card was reported lost (the donor is told only that it was declined).",
    "stolen_card": "The card was reported stolen (the donor is told only that it was declined).",
    "pickup_card": "The bank asked for the card to be retained (it may be lost or stolen).",
    "fraudulent": "The bank suspects fraud.",
    "highest_risk_level": "Stripe Radar blocked the payment as high risk.",
    "elevated_risk_level": "Stripe Radar flagged the payment as risky and the bank declined it.",
    "merchant_blacklist": "Blocked by our Stripe block list.",
    "rule": "Blocked by one of our Stripe Radar rules.",
}

# Donor-facing hints. Anything not listed (and everything fraud-related, as
# Stripe recommends) is presented only as "declined by the card issuer".
_DONOR_HINTS = {
    "expired_card": "the card appears to have expired",
    "incorrect_cvc": "the security code (CVC) did not match",
    "invalid_cvc": "the security code (CVC) did not match",
    "incorrect_number": "the card number did not match",
    "invalid_number": "the card number did not match",
    "invalid_expiry_month": "the expiry date did not match",
    "invalid_expiry_year": "the expiry date did not match",
    "incorrect_zip": "the postal / ZIP code did not match the card",
    "authentication_required": "your bank asked for an extra verification step that was not completed",
    "payment_intent_authentication_failure": "your bank's verification step was not completed",
    "processing_error": "a temporary error occurred while processing the card",
    "try_again_later": "your bank had a temporary problem",
    "issuer_not_available": "your bank could not be reached at that moment",
}

_NOT_MONEY_PREFIXES = ("failed", "abandoned", "pending")


def is_unsuccessful(frequency: str | None) -> bool:
    return (frequency or "").lower().startswith(_NOT_MONEY_PREFIXES)


def _code_of(donation) -> str | None:
    if donation.failure_code:
        return donation.failure_code
    # Rows from before migration 43 only have the code inside `frequency`.
    f = (donation.frequency or "").strip()
    if f.lower() == "abandoned":
        return CHECKOUT_EXPIRED
    if f.lower().startswith("failed - "):
        return f[len("failed - "):].strip() or None
    return None


def explain_failure(donation) -> str | None:
    """One line for staff saying why the payment did not go through."""
    f = (donation.frequency or "").lower()
    if not (f.startswith("failed") or f.startswith("abandoned")):
        return None
    code = _code_of(donation)
    text = _EXPLANATIONS.get(code or "")
    if code == CHECKOUT_EXPIRED and donation.failure_detail:
        # The donor did try a card before leaving: say so, it is the real reason.
        text = "The donor left the payment page after a failed attempt. No card was charged."
    if text:
        return text
    if code:
        return "Stripe reported: %s." % code.replace("_", " ")
    return "Stripe did not say why."


def donor_reason(donation) -> str:
    """What the donor is told happened: never the sensitive codes."""
    code = _code_of(donation)
    if code == CHECKOUT_EXPIRED:
        return "the payment page was closed before the payment was completed"
    hint = _DONOR_HINTS.get(code or "")
    return hint or "the payment was declined by the card issuer"


def schedule_followup(donation, now: datetime | None = None) -> None:
    """Mark a just-recorded failed/abandoned donation for a follow-up email."""
    if not donation.email:
        return
    now = now or datetime.utcnow()
    donation.followup_status = SCHEDULED
    donation.followup_due_at = now + FOLLOWUP_DELAY


def _completed_since(db: Session, donation) -> bool:
    from models import Donation

    email = (donation.email or "").strip().lower()
    since = donation.donated_at or datetime.min
    if _code_of(donation) == CHECKOUT_EXPIRED and donation.donated_at:
        # Recorded when Stripe expired the session, up to a day after the
        # donor opened it; a gift completed in between still counts.
        since = donation.donated_at - CHECKOUT_LIFETIME
    q = db.query(Donation.id).filter(
        func.lower(Donation.email) == email,
        Donation.donated_at >= since,
        Donation.id != donation.id,
        Donation.amount > 0,
    )
    for prefix in ("Failed%", "Abandoned%", "Pending%", "failed%", "abandoned%", "pending%"):
        q = q.filter(~Donation.frequency.like(prefix))
    return db.query(q.exists()).scalar()


def _contacted_recently(db: Session, donation, now: datetime) -> bool:
    from models import Donation

    email = (donation.email or "").strip().lower()
    return db.query(
        db.query(Donation.id).filter(
            func.lower(Donation.email) == email,
            Donation.followup_status == SENT,
            Donation.followup_sent_at >= now - FOLLOWUP_COOLDOWN,
        ).exists()
    ).scalar()


def _send(db: Session, donation) -> bool:
    from marketing.mailer import enqueue_email

    first_name = (donation.name or "").strip().split(" ")[0]
    if not first_name or first_name.lower() == "anonymous":
        first_name = None
    when = donation.donated_at or datetime.utcnow()
    phone_digits = "".join(c for c in FOLLOWUP_PHONE if c.isdigit())
    row = enqueue_email(
        db,
        template_slug="donation_followup",
        to_email=donation.email,
        to_name=donation.name if first_name else None,
        subject="JazakAllahu khayran for your intention to give. May we help?",
        context={
            "first_name": first_name,
            "amount_str": "${:,.2f}".format(donation.amount or 0),
            "date_str": when.strftime("%B %d, %Y"),
            "reason": donor_reason(donation),
            "donate_url": "%s/donate" % FRONTEND_URL.rstrip("/"),
            "contact_email": FOLLOWUP_FROM_EMAIL,
            "contact_phone": FOLLOWUP_PHONE,
            "whatsapp_url": "https://wa.me/%s" % phone_digits,
            "frontend_url": FRONTEND_URL,
            "brand_color": "#1e3a8a",
            "brand_title": "Zakat Distribution Foundation",
            "brand_subtitle": "Your Zakat, Their Lifeline.",
        },
        category="transactional",
        idempotency_key="donation-followup-%d" % donation.id,
        from_email=FOLLOWUP_FROM_EMAIL,
        from_name=FOLLOWUP_FROM_NAME,
        reply_to=FOLLOWUP_FROM_EMAIL,
    )
    return row is not None and row.status != "suppressed"


def process_due_followups(db: Session, now: datetime | None = None, limit: int = 50) -> dict:
    """Decide and send every follow-up whose delay has passed. Run by the worker."""
    from models import Donation

    now = now or datetime.utcnow()
    due = (
        db.query(Donation)
        .filter(Donation.followup_status == SCHEDULED, Donation.followup_due_at <= now)
        .order_by(Donation.id.asc())
        .limit(limit)
        .all()
    )
    counts = {SENT: 0, NOT_NEEDED: 0, SKIPPED: 0}
    for donation in due:
        try:
            if _completed_since(db, donation):
                outcome = NOT_NEEDED
            elif _contacted_recently(db, donation, now):
                outcome = SKIPPED
            else:
                outcome = SENT if _send(db, donation) else SKIPPED
            donation.followup_status = outcome
            if outcome == SENT:
                donation.followup_sent_at = now
            # One commit per row: the next row's "contacted recently" check
            # must see this one, or three declines in a row email three times.
            db.commit()
            counts[outcome] += 1
            if outcome == SENT:
                logger.event(
                    ev.DONATION_FOLLOWUP_EMAILED, "offered the donor help to complete their gift",
                    outcome=ev.OUTCOME_SUCCESS, donation_id=donation.id,
                    stripe_code=_code_of(donation), email=mask_email(donation.email),
                )
        except Exception as e:
            db.rollback()
            logger.event(
                ev.DONATION_FOLLOWUP_FAILED, "could not send the follow-up email",
                level=logging.ERROR, exc=e, outcome=ev.OUTCOME_FAILURE,
                reason=ev.REASON_EMAIL_SEND_FAILED, donation_id=donation.id,
            )
            # Do not retry forever: one failed attempt leaves it for staff.
            try:
                donation.followup_status = SKIPPED
                db.commit()
            except Exception:
                db.rollback()
    return counts
