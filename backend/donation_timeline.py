"""What exactly happened to a failed or abandoned donation, asked of Stripe live.

The webhook only records the outcome. For staff wondering "did the donor even
try to pay?", this reads the Checkout session (or the failed charge) back from
Stripe and lists every step with its time: the session opening, each payment
attempt with the card and Stripe's reason, a later successful retry, and the
expiry. It works for donations recorded before failure details were kept.

Read-only towards Stripe. The one thing it writes is failure_detail on our row,
and only when it was empty, so the list shows the reason from then on.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import stripe


class TimelineUnavailable(Exception):
    """Stripe could not be asked (not configured, unknown id, API error)."""


def _plain(obj: Any) -> Any:
    """A Stripe object as plain dicts and lists, whatever the SDK version."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, list):
        return [_plain(x) for x in obj]
    for attr in ("to_dict_recursive", "to_dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return _plain_dict(fn())
            except Exception:
                pass
    if isinstance(obj, dict):
        return _plain_dict(obj)
    try:
        return json.loads(str(obj))
    except Exception:
        return {}


def _plain_dict(d: dict) -> dict:
    return {k: _plain(v) if not isinstance(v, dict) else _plain_dict(v) for k, v in dict(d).items()}


def _at(ts) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _money(cents, currency="usd") -> str:
    amount = (cents or 0) / 100.0
    return ("$%s" % "{:,.2f}".format(amount)) if (currency or "usd").lower() == "usd" else \
        "%s %s" % ("{:,.2f}".format(amount), currency.upper())


def _card(charge: dict) -> str:
    card = ((charge.get("payment_method_details") or {}).get("card")) or {}
    if not card.get("last4"):
        kind = (charge.get("payment_method_details") or {}).get("type")
        return kind.replace("_", " ") if kind else "a payment method"
    wallet = (card.get("wallet") or {}).get("type")
    label = "%s •••• %s" % ((card.get("brand") or "card").title(), card["last4"])
    if wallet:
        label += " via %s" % wallet.replace("_", " ").title()
    if card.get("country"):
        label += " (%s)" % card["country"]
    return label


def _charge_step(charge: dict) -> dict:
    outcome = charge.get("outcome") or {}
    codes = [c for c in (charge.get("failure_code"), outcome.get("reason"), outcome.get("network_status")) if c]
    if charge.get("status") == "succeeded" or charge.get("paid"):
        return {"at": _at(charge.get("created")), "tone": "success",
                "label": "Payment of %s succeeded with %s" % (
                    _money(charge.get("amount"), charge.get("currency")), _card(charge))}
    return {
        "at": _at(charge.get("created")), "tone": "danger",
        "label": "Payment attempt with %s was declined" % _card(charge),
        "detail": "; ".join(x for x in (
            charge.get("failure_message") or outcome.get("seller_message"),
            ("Stripe codes: %s" % ", ".join(dict.fromkeys(codes))) if codes else None,
            ("Radar risk: %s" % outcome.get("risk_level")) if outcome.get("risk_level")
            not in (None, "normal", "not_assessed") else None,
        ) if x) or None,
    }


def _charges_of(payment_intent_id: str) -> list[dict]:
    listing = _plain(stripe.Charge.list(payment_intent=payment_intent_id, limit=20))
    return sorted(listing.get("data") or [], key=lambda c: c.get("created") or 0)


def _session_timeline(session_id: str) -> dict:
    s = _plain(stripe.checkout.Session.retrieve(session_id))
    meta = s.get("metadata") or {}
    what = meta.get("purpose") or ("recurring donation" if s.get("mode") == "subscription" else "donation")
    steps = [{
        "at": _at(s.get("created")), "tone": "info",
        "label": "Donor opened the Stripe payment page for %s (%s)" % (
            _money(s.get("amount_total"), s.get("currency")), what),
    }]

    attempts, last_error = [], None
    pi_id = s.get("payment_intent")
    if isinstance(pi_id, dict):
        pi_id = pi_id.get("id")
    if pi_id:
        attempts = _charges_of(pi_id)
        if not attempts:
            pi = _plain(stripe.PaymentIntent.retrieve(pi_id))
            last_error = pi.get("last_payment_error")
    steps += [_charge_step(c) for c in attempts]
    if last_error:
        codes = [c for c in (last_error.get("code"), last_error.get("decline_code")) if c]
        steps.append({"at": None, "tone": "danger", "label": "A payment attempt failed before any charge",
                      "detail": "; ".join(x for x in (last_error.get("message"),
                                                      ("Stripe codes: %s" % ", ".join(codes)) if codes else None)
                                          if x) or None})

    status = s.get("status")
    if status == "expired":
        steps.append({"at": _at(s.get("expires_at")), "tone": "neutral",
                      "label": "Stripe closed the payment page: it expired unpaid"})
    elif status == "complete":
        steps.append({"at": None, "tone": "success", "label": "The checkout was completed"})
    elif status == "open":
        steps.append({"at": _at(s.get("expires_at")), "tone": "neutral",
                      "label": "The payment page is still open; it expires at this time"})

    tried = bool(attempts) or bool(last_error)
    succeeded = any(st["tone"] == "success" for st in steps)
    if succeeded:
        summary = "The donor did pay in the end."
    elif tried:
        n = len(attempts) or 1
        summary = "The donor tried to pay (%d attempt%s), was declined, then left." % (n, "" if n == 1 else "s")
    elif s.get("mode") == "subscription":
        summary = ("No payment attempt is recorded on this session: the donor most likely left "
                   "without submitting a card.")
    else:
        summary = "The donor left without ever submitting a card: no payment was attempted."
    return {"summary": summary, "steps": steps, "attempted": tried}


def _charge_timeline(charge_id: str) -> dict:
    ch = _plain(stripe.Charge.retrieve(charge_id))
    pi_id = ch.get("payment_intent")
    charges = _charges_of(pi_id) if pi_id else [ch]
    if not any(c.get("id") == ch.get("id") for c in charges):
        charges.append(ch)
    steps = [_charge_step(c) for c in sorted(charges, key=lambda c: c.get("created") or 0)]
    succeeded = any(st["tone"] == "success" for st in steps)
    declined = sum(1 for st in steps if st["tone"] == "danger")
    summary = ("The donor was declined, then paid successfully with another attempt." if succeeded else
               "The payment was declined%s." % ("" if declined <= 1 else " %d times" % declined))
    return {"summary": summary, "steps": steps, "attempted": True}


def stripe_timeline(donation) -> dict:
    ref = (donation.stripe_session_id or "").strip()
    if not stripe.api_key:
        raise TimelineUnavailable("Stripe is not configured on this server.")
    if not ref:
        raise TimelineUnavailable("This donation has no Stripe reference to look up.")
    try:
        if ref.startswith("cs_"):
            result = _session_timeline(ref)
        elif ref.startswith("ch_") or ref.startswith("py_"):
            result = _charge_timeline(ref)
        else:
            raise TimelineUnavailable("Unrecognised Stripe reference: %s" % ref[:12])
    except stripe.error.InvalidRequestError as e:
        raise TimelineUnavailable("Stripe does not know this reference (%s)." % (e.user_message or "not found"))
    except stripe.error.StripeError as e:
        raise TimelineUnavailable("Stripe could not be reached: %s" % (e.user_message or type(e).__name__))
    result["checked_at"] = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    return result


def detail_from_timeline(timeline: dict) -> str | None:
    """A failure_detail text from the declined steps, for rows that had none."""
    lines = []
    for st in timeline.get("steps") or []:
        if st.get("tone") == "danger":
            lines.append(st["label"] + (": %s" % st["detail"] if st.get("detail") else ""))
    return "\n".join(lines) or None
