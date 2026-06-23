"""Email service — thin shims that enqueue templated emails via the marketing pipeline.

Every function in this module renders a Jinja template (under
backend/email_templates/) and enqueues the result through ComplianceMailer.
The actual delivery happens asynchronously in the Arq worker — these
functions return True immediately if the row was queued (or skipped because
of suppression), False only on an unexpected error.

This file replaces the old SMTP-direct implementation. The 7 existing
public functions (send_verification_email, send_donation_certificate_email,
etc.) are kept with the same signatures so callers don't have to change.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from logging_config import get_logger
from database import SessionLocal

from marketing.mailer import enqueue_email
from marketing.resend_client import encode_attachment

logger = get_logger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ADMIN_NOTIFICATION_EMAIL = os.getenv(
    "ADMIN_NOTIFICATION_EMAIL",
    os.getenv("RESEND_REPLY_TO", "info@myzakat.org"),
)


def _enqueue(template_slug: str, **kwargs) -> bool:
    """Open a short-lived DB session and enqueue. Returns True on success."""
    db = SessionLocal()
    try:
        row = enqueue_email(db, template_slug=template_slug, **kwargs)
        return row is not None and row.status in ("pending", "sending", "suppressed")
    except Exception as exc:
        logger.exception("Failed to enqueue %s: %s", template_slug, exc)
        return False
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────
# Transactional emails (called from routers)
# ─────────────────────────────────────────────────────────────────────

def send_verification_email(email: str, name: str, verification_token: str) -> bool:
    """Send email-verification link to a new user."""
    verification_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"
    return _enqueue(
        "verification",
        to_email=email,
        to_name=name,
        subject="Verify Your Email Address — MyZakat",
        context={"name": name, "verification_link": verification_link},
        category="transactional",
        idempotency_key=f"verify-{verification_token[:32]}",
    )


def send_donation_certificate_email(
    email: str,
    name: str,
    amount: float,
    pdf_path: str,
    donation_date: Optional[datetime] = None,
) -> bool:
    """Send the official ZDF donation receipt PDF + acknowledgement email."""
    if donation_date is None:
        donation_date = datetime.utcnow()
    donation_date_str = donation_date.strftime("%B %d, %Y")
    amount_str = f"${amount:,.2f}"
    donor_name = name or "Donor"

    attachments = []
    try:
        if pdf_path and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as pdf_file:
                attachments.append(
                    encode_attachment(
                        f"ZDF_Donation_Receipt_{donor_name.replace(' ', '_')}_"
                        f"{donation_date.strftime('%Y%m%d')}.pdf",
                        pdf_file.read(),
                        content_type="application/pdf",
                    )
                )
    except Exception as exc:
        logger.warning("Could not attach PDF receipt %s: %s", pdf_path, exc)

    return _enqueue(
        "donation_receipt",
        to_email=email,
        to_name=donor_name,
        subject="Your Donation Receipt — Zakat Distribution Foundation",
        context={
            "donor_name": donor_name,
            "amount_str": amount_str,
            "donation_date_str": donation_date_str,
            "brand_color": "#1e3a8a",
            "brand_title": "Zakat Distribution Foundation",
            "brand_subtitle": "Your Zakat, Their Lifeline.",
        },
        category="transactional",
        attachments=attachments or None,
        idempotency_key=f"receipt-{email}-{int(donation_date.timestamp())}",
    )


def send_contact_reply_email(
    recipient_email: str,
    recipient_name: str,
    original_message: str,
    reply_message: str,
) -> bool:
    """Send the admin's reply to a contact-form submission."""
    return _enqueue(
        "contact_reply",
        to_email=recipient_email,
        to_name=recipient_name,
        subject="Re: Your Contact Form Submission — MyZakat",
        context={
            "recipient_name": recipient_name,
            "original_message": original_message,
            "reply_message": reply_message,
        },
        category="transactional",
    )


def send_contact_admin_notification(
    submitter_name: str,
    submitter_email: str,
    message: str,
) -> bool:
    """Notify admins that a new contact form has been submitted."""
    return _enqueue(
        "contact_admin_notification",
        to_email=ADMIN_NOTIFICATION_EMAIL,
        subject=f"New Contact Form Submission from {submitter_name}",
        context={
            "submitter_name": submitter_name,
            "submitter_email": submitter_email,
            "message": message,
            "submitted_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "admin_url": f"{FRONTEND_URL}/admin/contacts",
        },
        category="transactional",
    )


def send_contact_acknowledgement(name: str, email: str, message: str) -> bool:
    """Auto-reply to the user who submitted the contact form."""
    return _enqueue(
        "contact_acknowledgement",
        to_email=email,
        to_name=name,
        subject="We received your message — MyZakat",
        context={"name": name, "message": message},
        category="transactional",
    )


def send_volunteer_admin_notification(
    name: str,
    email: str,
    interest: str,
    phone: Optional[str] = None,
    message: Optional[str] = None,
) -> bool:
    """Notify admins that a new volunteer signed up."""
    return _enqueue(
        "volunteer_admin_notification",
        to_email=ADMIN_NOTIFICATION_EMAIL,
        subject=f"New Volunteer Sign-up: {name}",
        context={
            "name": name,
            "email": email,
            "interest": interest,
            "phone": phone,
            "message": message,
            "submitted_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "admin_url": f"{FRONTEND_URL}/admin/volunteers",
            "brand_color": "#16a34a",
        },
        category="transactional",
    )


def send_volunteer_acknowledgement(name: str, email: str, interest: str) -> bool:
    """Thank-you email to a new volunteer."""
    return _enqueue(
        "volunteer_acknowledgement",
        to_email=email,
        to_name=name,
        subject="Thank you for volunteering with MyZakat",
        context={
            "name": name,
            "interest": interest,
            "brand_color": "#16a34a",
        },
        category="transactional",
    )
