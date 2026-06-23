"""Marketing automation package.

P1: durable outbox + Resend transport + Jinja templates + compliance core.
"""
from .mailer import ComplianceMailer, enqueue_email
from .compliance import (
    is_suppressed,
    suppress_email,
    generate_unsubscribe_token,
    consume_unsubscribe_token,
    log_consent,
)

__all__ = [
    "ComplianceMailer",
    "enqueue_email",
    "is_suppressed",
    "suppress_email",
    "generate_unsubscribe_token",
    "consume_unsubscribe_token",
    "log_consent",
]
