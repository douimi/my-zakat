"""Arq worker: send_email_task + outbox scanner cron.

Runs in a separate `worker` container in docker-compose. The FastAPI app
enqueues jobs from request handlers; the worker pulls them from Redis,
calls Resend, updates the outbox row.

Also runs a 60-second cron that scans for any 'pending' rows the immediate
enqueue might have missed (e.g. Redis was briefly down when the API tried
to enqueue). This is the durability guarantee.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from database import SessionLocal
from logging_config import get_logger
from models import EmailOutbox
from sqlalchemy import or_

from .resend_client import ResendDeliveryError, send_email as resend_send

logger = get_logger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
MAX_ATTEMPTS = int(os.getenv("EMAIL_MAX_ATTEMPTS", "3"))


# ─────────────────────────────────────────────────────────────────────
# Tasks
# ─────────────────────────────────────────────────────────────────────

async def send_email_task(ctx: dict[str, Any], outbox_id: int) -> None:
    """Pull outbox row, attempt delivery, update status.

    Idempotent: if the row is already in 'sent' state we exit immediately.
    On failure we increment attempts and (if under max) re-enqueue with
    exponential backoff.
    """
    db = SessionLocal()
    try:
        row = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
        if not row:
            logger.warning("send_email_task: outbox row %s not found", outbox_id)
            return
        if row.status in ("sent", "suppressed"):
            return  # Already handled — idempotent no-op.

        row.status = "sending"
        row.attempts = (row.attempts or 0) + 1
        db.commit()

        try:
            message_id = resend_send(
                to_email=row.to_email,
                to_name=row.to_name,
                from_email=row.from_email,
                from_name=row.from_name,
                subject=row.subject,
                body_html=row.body_html,
                body_text=row.body_text or "",
                reply_to=row.reply_to,
                attachments=row.attachments or None,
                idempotency_key=row.idempotency_key,
                tags=[
                    {"name": "category", "value": row.category},
                    {"name": "template", "value": row.template_slug or "raw"},
                ],
            )
            row.provider_message_id = message_id
            row.status = "sent"
            row.sent_at = datetime.utcnow()
            row.error = None
            db.commit()
            logger.info("Sent outbox %s to %s (resend id=%s)", row.id, row.to_email, message_id)

        except ResendDeliveryError as exc:
            row.error = str(exc)[:2000]
            if row.attempts >= (row.max_attempts or MAX_ATTEMPTS):
                row.status = "failed"
                db.commit()
                logger.error("Outbox %s permanently failed after %s attempts: %s", row.id, row.attempts, exc)
            else:
                # Re-queue with exponential backoff. Arq will pick it up via
                # the scan_outbox cron at queue_after.
                backoff_seconds = 2 ** row.attempts * 30
                row.status = "pending"
                row.queue_after = datetime.utcnow() + timedelta(seconds=backoff_seconds)
                db.commit()
                logger.warning(
                    "Outbox %s failed (attempt %s/%s) — retrying in %ss: %s",
                    row.id, row.attempts, row.max_attempts, backoff_seconds, exc,
                )
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────
# Cron: outbox scanner (safety net)
# ─────────────────────────────────────────────────────────────────────

async def scan_outbox(ctx: dict[str, Any]) -> None:
    """Every 60s, pick up any 'pending' rows whose queue_after has passed.

    This is the safety net that catches:
      - rows where the API couldn't reach Redis at enqueue time
      - rows in retry backoff
      - rows enqueued before the worker started
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        rows = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.status == "pending", EmailOutbox.queue_after <= now)
            .order_by(EmailOutbox.id.asc())
            .limit(50)
            .all()
        )
        if not rows:
            return
        arq_pool = ctx["redis"]
        for row in rows:
            await arq_pool.enqueue_job(
                "send_email_task",
                row.id,
                _job_id=f"send-email-{row.id}-{row.attempts}",
            )
        logger.info("scan_outbox: enqueued %s rows", len(rows))
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────
# Worker settings (consumed by `arq backend.marketing.queue.WorkerSettings`)
# ─────────────────────────────────────────────────────────────────────

def _redis_settings() -> RedisSettings:
    """Parse REDIS_URL (redis://host:port/db) into arq's RedisSettings."""
    from urllib.parse import urlparse

    parsed = urlparse(REDIS_URL)
    return RedisSettings(
        host=parsed.hostname or "redis",
        port=parsed.port or 6379,
        database=int((parsed.path or "/0").lstrip("/") or 0),
        password=parsed.password,
    )


class WorkerSettings:
    """Arq worker entrypoint — register via `arq backend.marketing.queue.WorkerSettings`."""

    functions = [send_email_task]
    cron_jobs = [
        cron(scan_outbox, second={0, 15, 30, 45}),  # every 15s
    ]
    redis_settings = _redis_settings()
    max_jobs = 10
    job_timeout = 60  # seconds per send attempt
    keep_result = 30  # keep results for 30s for debugging


# ─────────────────────────────────────────────────────────────────────
# Enqueue from the API side (called by ComplianceMailer.queue)
# ─────────────────────────────────────────────────────────────────────

def enqueue_send_job(outbox_id: int) -> None:
    """Synchronous helper used from request handlers.

    Connects briefly to Redis, enqueues the job, then disconnects. If Redis
    is unavailable the call raises and the caller logs it — the scan_outbox
    cron will pick up the row next time.
    """
    import asyncio

    from arq import create_pool

    async def _do() -> None:
        pool = await create_pool(_redis_settings())
        try:
            await pool.enqueue_job("send_email_task", outbox_id, _job_id=f"send-email-{outbox_id}-0")
        finally:
            await pool.close()

    try:
        loop = asyncio.get_running_loop()
        # We're inside an async context (FastAPI request) — schedule on the loop.
        loop.create_task(_do())
    except RuntimeError:
        # No running loop — sync context; create one ad-hoc.
        asyncio.run(_do())
