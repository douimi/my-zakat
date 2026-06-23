"""Audience queries + segment predicate compiler.

`marketing_contacts` is exposed as a Python function that returns a SQLAlchemy
query unioning every contact-bearing source table (users, subscriptions,
volunteers, donation_subscriptions, donations) and produces a row shaped like:

    email, name, has_email_consent, sms_consent, last_donation_at,
    total_donated_cents, donation_count, is_volunteer, source

The predicate compiler translates a JSON segment definition like

    [
        {"field": "total_donated_cents", "op": "gte", "value": 10000},
        {"field": "last_donation_at", "op": "lte", "value": "2025-01-01"},
    ]

into SQLAlchemy WHERE clauses applied to that query. Predicates are joined
with AND. (OR / nesting is a P3 follow-up — see the synthesis plan.)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    String, and_, case, func, literal, literal_column, or_, select, union_all,
)
from sqlalchemy.orm import Session

from logging_config import get_logger
from models import (
    ContactTagAssignment,
    Donation,
    DonationSubscription,
    EmailSuppression,
    Subscription,
    User,
    Volunteer,
)

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Unified contacts query
# ─────────────────────────────────────────────────────────────────────

def marketing_contacts_query(db: Session):
    """Return a SQLAlchemy core query that UNIONs every contact-bearing source.

    Each branch produces the same column shape so the resulting rows are
    comparable. Aggregates (total_donated, donation_count, last_donation_at)
    are computed per-email via a separate aggregate sub-query so that a row
    sourced from `users` still gets correct donation stats.
    """
    # Aggregate per-email donation stats.
    donation_agg = (
        select(
            func.lower(Donation.email).label("agg_email"),
            func.coalesce(func.sum(Donation.amount), 0).label("total_donated"),
            func.count(Donation.id).label("donation_count"),
            func.max(Donation.donated_at).label("last_donation_at"),
        )
        .group_by(func.lower(Donation.email))
        .subquery()
    )

    # Branch 1: users
    q_users = select(
        func.lower(User.email).label("email"),
        User.name.label("name"),
        literal(True).label("has_email_consent"),  # registered users have consented to receive emails
        literal(False).label("sms_consent"),
        literal("user").label("source"),
    ).where(User.is_active == True)  # noqa: E712

    # Branch 2: newsletter subscriptions
    q_subs = select(
        func.lower(Subscription.email).label("email"),
        Subscription.name.label("name"),
        Subscription.wants_email.label("has_email_consent"),
        Subscription.wants_sms.label("sms_consent"),
        literal("subscription").label("source"),
    )

    # Branch 3: volunteers
    q_volunteers = select(
        func.lower(Volunteer.email).label("email"),
        Volunteer.name.label("name"),
        literal(True).label("has_email_consent"),  # volunteers consented when they signed up
        literal(False).label("sms_consent"),
        literal("volunteer").label("source"),
    )

    # Branch 4: one-time donors (people in donations but not subs/users)
    q_donors = select(
        func.lower(Donation.email).label("email"),
        Donation.name.label("name"),
        literal(True).label("has_email_consent"),  # donors gave email on the donation form
        literal(False).label("sms_consent"),
        literal("donor").label("source"),
    ).group_by(func.lower(Donation.email), Donation.name)

    # Branch 5: recurring donors
    q_recurring = select(
        func.lower(DonationSubscription.email).label("email"),
        DonationSubscription.name.label("name"),
        literal(True).label("has_email_consent"),
        literal(False).label("sms_consent"),
        literal("recurring").label("source"),
    ).where(DonationSubscription.status == "active").group_by(
        func.lower(DonationSubscription.email), DonationSubscription.name
    )

    union_sub = union_all(q_users, q_subs, q_volunteers, q_donors, q_recurring).subquery("u")

    # De-duplicate by lower(email). When the same address appears in several
    # branches we collapse to one row, keeping the first non-null name.
    dedup = (
        select(
            union_sub.c.email.label("email"),
            func.max(union_sub.c.name).label("name"),
            func.bool_or(union_sub.c.has_email_consent).label("has_email_consent"),
            func.bool_or(union_sub.c.sms_consent).label("sms_consent"),
            func.string_agg(union_sub.c.source, ",").label("sources"),
        )
        .group_by(union_sub.c.email)
        .subquery("d")
    )

    final = (
        select(
            dedup.c.email,
            dedup.c.name,
            dedup.c.has_email_consent,
            dedup.c.sms_consent,
            dedup.c.sources,
            func.coalesce(donation_agg.c.total_donated, 0).label("total_donated"),
            func.coalesce(donation_agg.c.donation_count, 0).label("donation_count"),
            donation_agg.c.last_donation_at.label("last_donation_at"),
        )
        .select_from(dedup.outerjoin(donation_agg, donation_agg.c.agg_email == dedup.c.email))
    )

    return final


# ─────────────────────────────────────────────────────────────────────
# Segment predicate compiler
# ─────────────────────────────────────────────────────────────────────

# Whitelisted field → SQL expression used in WHERE clauses.
def _field_exprs(subq):
    return {
        "email":             subq.c.email,
        "name":              subq.c.name,
        "has_email_consent": subq.c.has_email_consent,
        "sms_consent":       subq.c.sms_consent,
        "sources":           subq.c.sources,           # comma-joined list (string contains)
        "total_donated":     subq.c.total_donated,
        "donation_count":    subq.c.donation_count,
        "last_donation_at":  subq.c.last_donation_at,
    }


def _coerce_value(field: str, value: Any) -> Any:
    """Coerce JSON values into the expected Python type for each field."""
    if field == "last_donation_at" and isinstance(value, str):
        # Accept YYYY-MM-DD or ISO timestamp
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00").rstrip("Z"))
        except ValueError:
            return datetime.strptime(value[:10], "%Y-%m-%d")
    if field in ("total_donated", "donation_count") and isinstance(value, str):
        return float(value) if "." in value else int(value)
    return value


def _apply_predicate(col, op: str, value: Any):
    """Map an op string to a SQLAlchemy comparison expression."""
    if op == "eq":     return col == value
    if op == "neq":    return col != value
    if op == "gt":     return col > value
    if op == "gte":    return col >= value
    if op == "lt":     return col < value
    if op == "lte":    return col <= value
    if op == "is_true":  return col.is_(True)
    if op == "is_false": return col.is_(False)
    if op == "is_null":  return col.is_(None)
    if op == "is_not_null": return col.isnot(None)
    if op == "contains":
        # String contains — case-insensitive
        return func.lower(col.cast(String)).contains(str(value).lower())
    if op == "in":
        if not isinstance(value, list):
            value = [value]
        return col.in_(value)
    if op == "not_in":
        if not isinstance(value, list):
            value = [value]
        return ~col.in_(value)
    raise ValueError(f"Unsupported predicate op: {op}")


VALID_FIELDS = {
    "email", "name", "has_email_consent", "sms_consent", "sources",
    "total_donated", "donation_count", "last_donation_at",
}
VALID_OPS = {
    "eq", "neq", "gt", "gte", "lt", "lte",
    "is_true", "is_false", "is_null", "is_not_null",
    "contains", "in", "not_in",
}


def compile_predicates(predicates: list[dict[str, Any]], subq) -> list:
    """Translate a list of predicate dicts into SQLAlchemy expressions (ANDed)."""
    if not predicates:
        return []
    exprs_by_field = _field_exprs(subq)
    where_clauses = []
    for p in predicates:
        if not isinstance(p, dict):
            raise ValueError("Each predicate must be an object")
        field = p.get("field")
        op = p.get("op")
        value = p.get("value")
        if field not in VALID_FIELDS:
            raise ValueError(f"Unknown segment field: {field!r}")
        if op not in VALID_OPS:
            raise ValueError(f"Unknown segment op: {op!r}")
        col = exprs_by_field[field]
        where_clauses.append(_apply_predicate(col, op, _coerce_value(field, value)))
    return where_clauses


# ─────────────────────────────────────────────────────────────────────
# Public helpers — preview / count / iterate
# ─────────────────────────────────────────────────────────────────────

def build_segment_query(db: Session, predicates: list[dict[str, Any]], *, require_email_consent: bool = True):
    """Return a (final_query, count_query) tuple compiled against marketing_contacts."""
    inner = marketing_contacts_query(db).subquery("mc")
    where = compile_predicates(predicates, inner)
    if require_email_consent:
        where.append(inner.c.has_email_consent.is_(True))

    # ALWAYS exclude suppressed addresses (marketing scope OR all).
    suppressed_subq = (
        select(EmailSuppression.email)
        .where(EmailSuppression.scope.in_(("all", "marketing")))
        .subquery()
    )
    where.append(~inner.c.email.in_(select(suppressed_subq.c.email)))

    final = select(
        inner.c.email,
        inner.c.name,
        inner.c.has_email_consent,
        inner.c.sources,
        inner.c.total_donated,
        inner.c.donation_count,
        inner.c.last_donation_at,
    ).where(and_(*where)) if where else select(inner)

    count = select(func.count()).select_from(final.subquery())
    return final, count


def preview_segment(db: Session, predicates: list[dict[str, Any]], sample_size: int = 5):
    """Return {'count': int, 'sample': [{email, name, ...}, ...]} for a segment definition."""
    final, count_q = build_segment_query(db, predicates)
    total = db.execute(count_q).scalar() or 0
    sample_rows = db.execute(final.limit(sample_size)).mappings().all()
    return {
        "count": total,
        "sample": [
            {
                "email": r["email"],
                "name": r["name"],
                "total_donated": float(r["total_donated"]) if r["total_donated"] is not None else 0.0,
                "donation_count": r["donation_count"] or 0,
                "last_donation_at": r["last_donation_at"].isoformat() if r["last_donation_at"] else None,
                "sources": r["sources"],
            }
            for r in sample_rows
        ],
    }


def iter_segment_recipients(db: Session, predicates: list[dict[str, Any]], *, batch_size: int = 500):
    """Yield recipient dicts in batches — used by the campaign send dispatcher."""
    final, _ = build_segment_query(db, predicates)
    offset = 0
    while True:
        rows = db.execute(final.limit(batch_size).offset(offset)).mappings().all()
        if not rows:
            break
        for r in rows:
            yield {"email": r["email"], "name": r["name"]}
        offset += batch_size
        if len(rows) < batch_size:
            break
