"""Thin wrapper around the Resend Python SDK.

Centralises the API key + default sender configuration so the rest of the
codebase can stay provider-agnostic. If we ever switch transports, this is
the only file that changes.
"""
from __future__ import annotations

import base64
import os
from typing import Any

import resend

from logging_config import get_logger

logger = get_logger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
DEFAULT_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "MyZakat <noreply@myzakat.org>")
DEFAULT_REPLY_TO = os.getenv("RESEND_REPLY_TO", "info@myzakat.org")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


class ResendDeliveryError(Exception):
    """Raised when Resend rejects a send call."""


def send_email(
    *,
    to_email: str,
    to_name: str | None,
    from_email: str,
    from_name: str | None,
    subject: str,
    body_html: str,
    body_text: str,
    reply_to: str | None = None,
    headers: dict[str, str] | None = None,
    attachments: list[dict[str, Any]] | None = None,
    idempotency_key: str | None = None,
    tags: list[dict[str, str]] | None = None,
) -> str:
    """Send a single email through Resend; return the provider message id.

    Attachments format (matching our outbox schema):
        [{"filename": "...", "content_b64": "...", "content_type": "application/pdf"}]
    """
    if not RESEND_API_KEY:
        raise ResendDeliveryError(
            "RESEND_API_KEY is not set. Configure it in the environment before sending."
        )

    sender = (
        f"{from_name} <{from_email}>" if from_name else from_email
    ) if not (from_name and "<" in from_email) else from_email

    payload: dict[str, Any] = {
        "from": sender,
        "to": [f"{to_name} <{to_email}>" if to_name else to_email],
        "subject": subject,
        "html": body_html,
        "text": body_text,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    if headers:
        payload["headers"] = headers
    if tags:
        payload["tags"] = tags
    if attachments:
        payload["attachments"] = [
            {
                "filename": a["filename"],
                "content": a["content_b64"],  # Resend accepts base64 string
                "content_type": a.get("content_type", "application/octet-stream"),
            }
            for a in attachments
        ]

    # NOTE: the Resend Python SDK does NOT accept extra kwargs on Emails.send().
    # We persist `idempotency_key` on email_outbox.idempotency_key for retry-safety
    # at OUR layer (the worker checks status before sending), which is sufficient.
    try:
        response = resend.Emails.send(payload)
    except Exception as exc:
        logger.error("Resend send failed for %s: %s", to_email, exc)
        raise ResendDeliveryError(str(exc)) from exc

    message_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
    if not message_id:
        raise ResendDeliveryError(f"Resend returned no message id: {response!r}")

    logger.info("Resend accepted email to %s (message id=%s)", to_email, message_id)
    return message_id


def encode_attachment(filename: str, file_bytes: bytes, content_type: str = "application/octet-stream") -> dict[str, Any]:
    """Convert raw file bytes into the attachment dict shape we store on the outbox row."""
    return {
        "filename": filename,
        "content_b64": base64.b64encode(file_bytes).decode("ascii"),
        "content_type": content_type,
    }
