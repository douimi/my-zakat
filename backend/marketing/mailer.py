"""ComplianceMailer + enqueue_email() — the public surface for sending email.

Every code path that sends email should go through `enqueue_email(...)`.
The mailer:
  1. Renders the chosen Jinja template (or accepts pre-rendered HTML/text).
  2. Checks the suppression list — refuses to send to suppressed addresses.
  3. Generates a one-click unsubscribe URL for marketing emails and injects
     it into the template context + List-Unsubscribe headers.
  4. Persists an EmailOutbox row (status='pending').
  5. Enqueues an Arq job that the worker will pick up and deliver.

The actual SMTP/Resend call happens in `queue.send_email_task` — never in the
request handler. That way a container crash mid-send doesn't drop email.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from logging_config import get_logger
from models import EmailOutbox

from .compliance import generate_unsubscribe_token, is_suppressed
from .renderer import render

logger = get_logger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://myzakat.org")
DEFAULT_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "noreply@myzakat.org").strip("<>")
DEFAULT_FROM_NAME = os.getenv("RESEND_FROM_NAME", "MyZakat")
DEFAULT_REPLY_TO = os.getenv("RESEND_REPLY_TO", "info@myzakat.org")


class ComplianceMailer:
    """Renders + persists + enqueues an email, with all compliance checks.

    Use `enqueue_email(...)` for the common case; instantiate `ComplianceMailer`
    directly only if you need to customise sender/headers per call.
    """

    def __init__(
        self,
        db: Session,
        *,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
    ):
        self.db = db
        self.from_email = from_email or DEFAULT_FROM_EMAIL
        self.from_name = from_name or DEFAULT_FROM_NAME
        self.reply_to = reply_to or DEFAULT_REPLY_TO

    def queue(
        self,
        *,
        to_email: str,
        subject: str,
        template_slug: str | None = None,
        context: dict[str, Any] | None = None,
        body_html: str | None = None,
        body_text: str | None = None,
        to_name: str | None = None,
        category: str = "transactional",
        attachments: list[dict[str, Any]] | None = None,
        idempotency_key: str | None = None,
    ) -> EmailOutbox | None:
        """Render + persist + enqueue. Returns the outbox row, or None if suppressed.

        Either `template_slug` (Jinja render) OR `body_html` + `body_text` must
        be provided. Marketing emails must use a template — transactional can
        pass raw bodies (we don't use that path in P1, but it's available).
        """
        if not to_email:
            raise ValueError("to_email is required")

        # 1. Suppression check — never send to suppressed addresses.
        if is_suppressed(self.db, to_email, scope=category) or is_suppressed(self.db, to_email, scope="all"):
            logger.info("Skipping send to suppressed address: %s (scope=%s)", to_email, category)
            row = EmailOutbox(
                category=category,
                template_slug=template_slug,
                to_email=to_email.strip().lower(),
                to_name=to_name,
                from_email=self.from_email,
                from_name=self.from_name,
                reply_to=self.reply_to,
                subject=subject,
                body_html=body_html or "",
                body_text=body_text or "",
                attachments=attachments or [],
                context=context or {},
                idempotency_key=idempotency_key,
                status="suppressed",
                error="Recipient on suppression list at queue time",
            )
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return row

        # 2. Generate unsubscribe URL for marketing emails (skip for transactional).
        ctx = dict(context or {})
        unsubscribe_url = None
        if category == "marketing":
            unsub_token = generate_unsubscribe_token(
                self.db, to_email, scope="marketing", issued_for=template_slug,
            )
            unsubscribe_url = f"{FRONTEND_URL}/unsubscribe?token={unsub_token}"
            ctx["unsubscribe_url"] = unsubscribe_url
        ctx.setdefault("subject", subject)

        # 3. Render template if provided.
        if template_slug:
            html, text = render(template_slug, ctx)
        else:
            if not body_html:
                raise ValueError("Either template_slug or body_html must be provided")
            html = body_html
            text = body_text or ""

        # 4. Persist outbox row.
        row = EmailOutbox(
            category=category,
            template_slug=template_slug,
            to_email=to_email.strip().lower(),
            to_name=to_name,
            from_email=self.from_email,
            from_name=self.from_name,
            reply_to=self.reply_to,
            subject=subject,
            body_html=html,
            body_text=text,
            attachments=attachments or [],
            context=ctx,
            idempotency_key=idempotency_key or secrets.token_urlsafe(24),
            status="pending",
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)

        # 5. Enqueue Arq job. We import inside the function to avoid a circular
        #    import at module load time and to allow graceful degradation if
        #    Redis is unavailable in a dev environment.
        try:
            from .queue import enqueue_send_job  # noqa: WPS433 — local import on purpose

            enqueue_send_job(row.id)
        except Exception as exc:
            # Don't crash the request — the row stays in 'pending' state and
            # will be picked up by the cron scan_outbox job on the worker.
            logger.warning("Could not enqueue outbox %s immediately (will be retried): %s", row.id, exc)

        return row


def enqueue_email(
    db: Session,
    *,
    to_email: str,
    subject: str,
    template_slug: str,
    context: dict[str, Any] | None = None,
    to_name: str | None = None,
    category: str = "transactional",
    attachments: list[dict[str, Any]] | None = None,
    idempotency_key: str | None = None,
    from_email: str | None = None,
    from_name: str | None = None,
    reply_to: str | None = None,
) -> EmailOutbox | None:
    """Convenience wrapper — most callers should use this.

    Renders the named template, persists an outbox row, and enqueues the send.
    Returns the EmailOutbox row, or None if the recipient is suppressed.
    """
    mailer = ComplianceMailer(
        db,
        from_email=from_email,
        from_name=from_name,
        reply_to=reply_to,
    )
    return mailer.queue(
        to_email=to_email,
        subject=subject,
        template_slug=template_slug,
        context=context,
        to_name=to_name,
        category=category,
        attachments=attachments,
        idempotency_key=idempotency_key,
    )
