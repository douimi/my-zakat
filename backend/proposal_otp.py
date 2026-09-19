"""One-time six-digit codes granting a submitter access to their dossiers.

There is no account behind these: the email address is the identity. That makes
the code the only thing between a guess and someone's application, so the rules
here are deliberately strict — hashed at rest, ten-minute lifetime, single use,
dead after five wrong guesses, and both the address and the caller's IP rate
limited.

The project has no rate-limiting middleware, so the limits are enforced by
counting rows in `proposal_access_codes` — the same record we want for audit
anyway.

On the two limits: the per-ADDRESS cap is the one that actually protects an
applicant, and it cannot be evaded, because the address is what the code is
minted for. The per-IP cap is defence in depth against someone sweeping many
addresses at once; it rests on X-Forwarded-For, which Traefik overwrites rather
than trusts (traefik.yml sets no forwardedHeaders.trustedIPs and does not
enable `insecure`), so it holds behind the proxy — but it would be evadable by
anything able to reach the backend port directly.

The caps are announced: a capped caller receives a 429 telling them to wait.
Hiding it bought nothing once the endpoint began answering truthfully about
whether an address has a dossier at all.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_utils import get_password_hash, verify_password
from logging_config import get_logger
from models import ProposalAccessCode

logger = get_logger(__name__)

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
MAX_CODES_PER_EMAIL = 3
EMAIL_WINDOW_MINUTES = 15
MAX_CODES_PER_IP = 10
IP_WINDOW_MINUTES = 60


def generate_code() -> str:
    """A uniformly random six-digit code, leading zeros included."""
    return f"{secrets.randbelow(1_000_000):06d}"


def is_rate_limited(db: Session, *, email: str, ip: str) -> bool:
    """True when this address or this IP has asked for too many codes lately."""
    now = datetime.utcnow()

    per_email = (
        db.query(func.count(ProposalAccessCode.id))
        .filter(
            func.lower(ProposalAccessCode.email) == email.strip().lower(),
            ProposalAccessCode.created_at >= now - timedelta(minutes=EMAIL_WINDOW_MINUTES),
        )
        .scalar()
        or 0
    )
    if per_email >= MAX_CODES_PER_EMAIL:
        logger.warning("Proposal portal: code requests capped for %s", email)
        return True

    if ip:
        per_ip = (
            db.query(func.count(ProposalAccessCode.id))
            .filter(
                ProposalAccessCode.request_ip == ip,
                ProposalAccessCode.created_at >= now - timedelta(minutes=IP_WINDOW_MINUTES),
            )
            .scalar()
            or 0
        )
        if per_ip >= MAX_CODES_PER_IP:
            logger.warning("Proposal portal: code requests capped for IP %s", ip)
            return True

    return False


def issue_code(db: Session, *, email: str, ip: str) -> str | None:
    """Mint a code for this address, or None when rate limited.

    Any earlier unconsumed code for the address is consumed on the way, so only
    the newest one can ever be used — a stale code sitting in an old email is
    never a second key.
    """
    if is_rate_limited(db, email=email, ip=ip):
        return None

    now = datetime.utcnow()
    db.query(ProposalAccessCode).filter(
        func.lower(ProposalAccessCode.email) == email.strip().lower(),
        ProposalAccessCode.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)

    code = generate_code()
    db.add(
        ProposalAccessCode(
            email=email.strip(),
            code_hash=get_password_hash(code),
            created_at=now,
            expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
            request_ip=ip or None,
        )
    )
    db.commit()
    return code


def verify_code(db: Session, *, email: str, code: str) -> bool:
    """Consume the newest live code for this address if `code` matches it.

    Returns False for every failure mode — no code on file, expired, already
    used, attempts exhausted, wrong digits — so neither the caller nor an
    attacker can tell them apart.
    """
    now = datetime.utcnow()
    row = (
        db.query(ProposalAccessCode)
        .filter(
            func.lower(ProposalAccessCode.email) == email.strip().lower(),
            ProposalAccessCode.consumed_at.is_(None),
            ProposalAccessCode.expires_at > now,
        )
        .order_by(ProposalAccessCode.created_at.desc())
        .first()
    )
    if row is None:
        return False

    if row.attempts >= MAX_ATTEMPTS:
        # Unreachable through this module's own writes -- the elif below burns
        # the row on the fifth wrong guess, in the same call that reaches the
        # cap. Kept as a backstop for a row left at the cap unconsumed by some
        # other path, and as a reminder that the increment must stay BELOW this
        # check: moving it above would spend an applicant's fifth legitimate
        # attempt before it was ever compared.
        row.consumed_at = now
        db.commit()
        return False

    row.attempts += 1
    matched = verify_password(code or "", row.code_hash)
    if matched:
        row.consumed_at = now
    elif row.attempts >= MAX_ATTEMPTS:
        # Burn it on the last wrong guess rather than leaving a live row behind.
        row.consumed_at = now
        logger.warning("Proposal portal: code burned after %s failed attempts", row.attempts)
    db.commit()
    return matched
