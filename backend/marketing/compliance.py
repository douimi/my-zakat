"""Compliance helpers: suppressions, unsubscribe tokens, consent logging.

These are pure DB operations + a small HMAC token signer. Imported by the
mailer (pre-send checks) and by the public unsubscribe + Resend webhook
endpoints.
"""
from __future__ import annotations

import hmac
import os
import secrets
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Optional

from sqlalchemy.orm import Session

from models import EmailSuppression, EmailUnsubscribeToken, EmailConsentLog
from logging_config import get_logger

logger = get_logger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-secret-key")
UNSUB_TOKEN_TTL_DAYS = int(os.getenv("UNSUB_TOKEN_TTL_DAYS", "365"))


# ─────────────────────────────────────────────────────────────────────
# Suppression list
# ─────────────────────────────────────────────────────────────────────

def is_suppressed(db: Session, email: str, scope: str = "all") -> bool:
    """Return True if `email` is on the suppression list for the given scope.

    A row scoped to 'all' suppresses every category; otherwise we match the
    exact scope.
    """
    if not email:
        return False
    normalized = email.strip().lower()
    rows = (
        db.query(EmailSuppression)
        .filter(EmailSuppression.email == normalized)
        .all()
    )
    for row in rows:
        if row.scope == "all" or row.scope == scope:
            return True
    return False


def suppress_email(
    db: Session,
    email: str,
    reason: str,
    *,
    scope: str = "all",
    source_message_id: str | None = None,
    note: str | None = None,
) -> EmailSuppression:
    """Add (or no-op update) a suppression row. Idempotent on (email, scope)."""
    normalized = email.strip().lower()
    existing = (
        db.query(EmailSuppression)
        .filter(EmailSuppression.email == normalized, EmailSuppression.scope == scope)
        .first()
    )
    if existing:
        return existing

    row = EmailSuppression(
        email=normalized,
        scope=scope,
        reason=reason,
        source_message_id=source_message_id,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Suppressed %s scope=%s reason=%s", normalized, scope, reason)
    return row


def unsuppress_email(db: Session, email: str, scope: str = "all") -> bool:
    """Remove a suppression — admin override for false positives."""
    normalized = email.strip().lower()
    deleted = (
        db.query(EmailSuppression)
        .filter(EmailSuppression.email == normalized, EmailSuppression.scope == scope)
        .delete()
    )
    db.commit()
    return deleted > 0


# ─────────────────────────────────────────────────────────────────────
# Unsubscribe tokens (HMAC-signed, single-use)
# ─────────────────────────────────────────────────────────────────────

def generate_unsubscribe_token(
    db: Session,
    email: str,
    *,
    scope: str = "all",
    issued_for: str | None = None,
) -> str:
    """Generate a single-use unsubscribe token for the given email.

    The token is HMAC-signed (so we can verify integrity even without a DB
    lookup) AND recorded in the DB so we can mark it as used after one click.
    """
    normalized = email.strip().lower()
    random_part = secrets.token_urlsafe(24)
    payload = f"{normalized}|{scope}|{random_part}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), sha256).hexdigest()[:16]
    token = f"{random_part}.{sig}"

    row = EmailUnsubscribeToken(
        token=token,
        email=normalized,
        scope=scope,
        issued_for=issued_for,
        expires_at=datetime.utcnow() + timedelta(days=UNSUB_TOKEN_TTL_DAYS),
    )
    db.add(row)
    db.commit()
    return token


def consume_unsubscribe_token(
    db: Session,
    token: str,
    *,
    used_ip: str | None = None,
) -> Optional[EmailUnsubscribeToken]:
    """Look up + mark a token as used. Returns the row if valid + unused, else None."""
    row = (
        db.query(EmailUnsubscribeToken)
        .filter(EmailUnsubscribeToken.token == token)
        .first()
    )
    if not row:
        return None
    if row.used_at is not None:
        # Already used — but for one-click compliance, re-clicking should NOT
        # error out for the user. Return the row so the caller can show a
        # "you're already unsubscribed" page.
        return row
    if row.expires_at and row.expires_at < datetime.utcnow():
        return None
    row.used_at = datetime.utcnow()
    row.used_ip = used_ip
    db.commit()
    return row


# ─────────────────────────────────────────────────────────────────────
# Consent log (append-only)
# ─────────────────────────────────────────────────────────────────────

def log_consent(
    db: Session,
    email: str,
    action: str,
    *,
    channel: str = "email",
    source: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    consent_text: str | None = None,
    metadata: dict | None = None,
) -> EmailConsentLog:
    """Append a consent event. Never updated — only inserted."""
    row = EmailConsentLog(
        email=email.strip().lower(),
        channel=channel,
        action=action,
        source=source,
        ip_address=ip_address,
        user_agent=user_agent,
        consent_text=consent_text,
        extra_metadata=metadata or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
