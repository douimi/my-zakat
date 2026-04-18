"""
Audit logging middleware for MyZakat.

Logs every state-changing request in a human-readable format:

    Otmane: logged in
    Zak: deleted story #5
    Omar: uploaded a new gallery image
    Admin: created a new event

Plus a structured tail for filtering/grouping in Grafana:
    [method=POST path=/api/stories status=200 duration_ms=42 ip=1.2.3.4]
"""
import time
import os
import re
from typing import Optional, Tuple

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from logging_config import get_logger
from database import SessionLocal
from models import User

logger = get_logger("audit")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-secret-key")
ALGORITHM = "HS256"

# Paths that should never be audited (noise / health checks / static files)
SKIP_PATHS = (
    "/health",
    "/api/uploads/",
    "/api/donations/stats",
    "/api/auth/me",
    "/api/user/dashboard-stats",
    "/api/settings/",
    "/api/slideshow/",
    "/api/gallery/",
    "/api/stories/",
    "/api/events/",
    "/api/testimonials/",
    "/api/programs/",
    "/api/program-categories/",
    "/api/urgent-needs/",
    "/api/donations/calculate-zakat",
)

# Methods that don't modify state
READ_METHODS = {"GET", "HEAD", "OPTIONS"}

# Special endpoints that we DO want to audit even if they're GETs/skip-paths
# (login, webhooks)
FORCE_AUDIT = {
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/donations/stripe-webhook"),
}


# Map (method, path-pattern) -> human-readable action
# Regex patterns match after the initial "/api/" prefix strip
ACTION_MAP: list[Tuple[str, re.Pattern, str]] = [
    # Auth
    ("POST", re.compile(r"^/api/auth/login$"), "logged in"),
    ("POST", re.compile(r"^/api/auth/register$"), "registered a new account"),
    ("POST", re.compile(r"^/api/auth/resend-verification$"), "requested a verification email"),

    # Donations (public user actions)
    ("POST", re.compile(r"^/api/donations/create-payment-session$"), "started a one-time donation"),
    ("POST", re.compile(r"^/api/donations/create-subscription$"), "started a recurring donation"),
    ("POST", re.compile(r"^/api/donations/stripe-webhook$"), "→ Stripe webhook received"),
    ("POST", re.compile(r"^/api/donations/cancel-subscription$"), "canceled a subscription"),
    ("POST", re.compile(r"^/api/donations/sync-stripe-data$"), "ran Stripe sync"),

    # Users (admin)
    ("DELETE", re.compile(r"^/api/admin/users/(\d+)$"), lambda m: f"deleted user #{m.group(1)}"),
    ("PATCH", re.compile(r"^/api/admin/users/(\d+)/toggle-admin$"), lambda m: f"toggled admin role for user #{m.group(1)}"),
    ("PATCH", re.compile(r"^/api/admin/users/(\d+)/toggle-active$"), lambda m: f"toggled active status for user #{m.group(1)}"),
    ("POST", re.compile(r"^/api/admin/change-password$"), "changed their password"),
    ("POST", re.compile(r"^/api/admin/upload-media$"), "uploaded a media file"),

    # Stories
    ("POST", re.compile(r"^/api/stories/?$"), "created a new story"),
    ("PUT", re.compile(r"^/api/stories/(\d+)$"), lambda m: f"updated story #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/stories/(\d+)$"), lambda m: f"deleted story #{m.group(1)}"),

    # Events
    ("POST", re.compile(r"^/api/events/upload-image$"), "uploaded an event image"),
    ("POST", re.compile(r"^/api/events/?$"), "created a new event"),
    ("PUT", re.compile(r"^/api/events/(\d+)$"), lambda m: f"updated event #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/events/(\d+)$"), lambda m: f"deleted event #{m.group(1)}"),

    # Testimonials
    ("POST", re.compile(r"^/api/testimonials/?$"), "created a new testimonial"),
    ("PATCH", re.compile(r"^/api/testimonials/(\d+)/approve$"), lambda m: f"approved testimonial #{m.group(1)}"),
    ("PUT", re.compile(r"^/api/testimonials/(\d+)$"), lambda m: f"updated testimonial #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/testimonials/(\d+)$"), lambda m: f"deleted testimonial #{m.group(1)}"),

    # Contact
    ("POST", re.compile(r"^/api/contact/?$"), "submitted a contact form"),
    ("PATCH", re.compile(r"^/api/contact/(\d+)/resolve$"), lambda m: f"resolved contact submission #{m.group(1)}"),
    ("POST", re.compile(r"^/api/contact/(\d+)/reply$"), lambda m: f"replied to contact #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/contact/(\d+)$"), lambda m: f"deleted contact submission #{m.group(1)}"),

    # Volunteers
    ("POST", re.compile(r"^/api/volunteers/?$"), "signed up as a volunteer"),
    ("DELETE", re.compile(r"^/api/volunteers/(\d+)$"), lambda m: f"deleted volunteer #{m.group(1)}"),

    # Newsletter subscriptions
    ("POST", re.compile(r"^/api/subscriptions/?$"), "subscribed to the newsletter"),
    ("DELETE", re.compile(r"^/api/subscriptions/(\d+)$"), lambda m: f"deleted newsletter subscription #{m.group(1)}"),
    ("POST", re.compile(r"^/api/subscriptions/send-newsletter$"), "sent a newsletter"),

    # Settings
    ("POST", re.compile(r"^/api/settings/?$"), "created a new setting"),
    ("PUT", re.compile(r"^/api/settings/([\w-]+)$"), lambda m: f"updated setting '{m.group(1)}'"),
    ("DELETE", re.compile(r"^/api/settings/([\w-]+)$"), lambda m: f"deleted setting '{m.group(1)}'"),

    # Slideshow
    ("POST", re.compile(r"^/api/slideshow/(\d+)/upload-image$"), lambda m: f"uploaded image for slide #{m.group(1)}"),
    ("POST", re.compile(r"^/api/slideshow/?$"), "created a new slideshow slide"),
    ("PUT", re.compile(r"^/api/slideshow/(\d+)$"), lambda m: f"updated slide #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/slideshow/(\d+)$"), lambda m: f"deleted slide #{m.group(1)}"),

    # Urgent needs
    ("POST", re.compile(r"^/api/urgent-needs/?$"), "created a new urgent need"),
    ("PUT", re.compile(r"^/api/urgent-needs/(\d+)$"), lambda m: f"updated urgent need #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/urgent-needs/(\d+)$"), lambda m: f"deleted urgent need #{m.group(1)}"),

    # Gallery
    ("POST", re.compile(r"^/api/gallery/upload$"), "uploaded a new gallery item"),
    ("POST", re.compile(r"^/api/gallery/reorder$"), "reordered the gallery"),
    ("POST", re.compile(r"^/api/gallery/?$"), "created a gallery item"),
    ("PUT", re.compile(r"^/api/gallery/(\d+)$"), lambda m: f"updated gallery item #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/gallery/(\d+)$"), lambda m: f"deleted gallery item #{m.group(1)}"),

    # Program categories
    ("POST", re.compile(r"^/api/program-categories/(\d+)/upload-video$"), lambda m: f"uploaded video for program category #{m.group(1)}"),
    ("POST", re.compile(r"^/api/program-categories/?$"), "created a program category"),
    ("PUT", re.compile(r"^/api/program-categories/(\d+)$"), lambda m: f"updated program category #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/program-categories/(\d+)$"), lambda m: f"deleted program category #{m.group(1)}"),

    # Programs
    ("POST", re.compile(r"^/api/programs/(\d+)/upload-video$"), lambda m: f"uploaded video for program #{m.group(1)}"),
    ("POST", re.compile(r"^/api/programs/?$"), "created a new program"),
    ("PUT", re.compile(r"^/api/programs/(\d+)$"), lambda m: f"updated program #{m.group(1)}"),
    ("DELETE", re.compile(r"^/api/programs/(\d+)$"), lambda m: f"deleted program #{m.group(1)}"),

    # S3 Media
    ("DELETE", re.compile(r"^/api/s3-media/(.+)$"), lambda m: f"deleted file '{m.group(1)}' from S3"),

    # Cleanup
    ("POST", re.compile(r"^/api/cleanup/orphaned-media$"), "scanned for orphaned media"),
    ("POST", re.compile(r"^/api/cleanup/auto-cleanup$"), "ran auto-cleanup of orphaned media"),

    # User account
    ("POST", re.compile(r"^/api/user/email-certificate/(\d+)$"), lambda m: f"emailed certificate for donation #{m.group(1)}"),
    ("POST", re.compile(r"^/api/user/cancel-subscription/(\d+)$"), lambda m: f"canceled their subscription #{m.group(1)}"),
    ("POST", re.compile(r"^/api/user/regenerate-certificate/(\d+)$"), lambda m: f"regenerated certificate for donation #{m.group(1)}"),
]


def _describe_action(method: str, path: str) -> Optional[str]:
    """Translate a method+path into a human-readable action phrase.

    Returns None for paths we don't know how to describe — caller should
    skip logging those.
    """
    for m, pattern, action in ACTION_MAP:
        if m != method:
            continue
        match = pattern.match(path)
        if match:
            return action(match) if callable(action) else action
    return None


def _decode_user_from_request(request: Request) -> Optional[dict]:
    """Extract user info from JWT. Returns None if no valid token."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None

    token = auth[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
    except JWTError:
        return None

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Prefer name, fall back to email username
            display = user.name or user.email.split("@")[0]
            return {"display": display, "email": user.email, "is_admin": user.is_admin}
    except Exception:
        pass
    finally:
        db.close()

    return {"display": email.split("@")[0], "email": email, "is_admin": False}


def _extract_email_from_body_for_login(body_bytes: bytes) -> Optional[str]:
    """For login/register, the user isn't authenticated yet — pull email from body."""
    try:
        import json
        data = json.loads(body_bytes.decode("utf-8"))
        return data.get("email")
    except Exception:
        return None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path

        # Decide whether to audit this request
        is_force_audit = (method, path) in FORCE_AUDIT
        is_skip_path = any(path.startswith(p) for p in SKIP_PATHS)
        is_read = method in READ_METHODS

        should_audit = is_force_audit or (not is_read and not is_skip_path)

        if not should_audit:
            return await call_next(request)

        # Capture body for login/register (to get email of un-authenticated user)
        body_bytes = b""
        if (method, path) in (("POST", "/api/auth/login"), ("POST", "/api/auth/register")):
            body_bytes = await request.body()

            # Rebuild the request so downstream can read body again
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            request._receive = receive

        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        # Figure out the actor
        user = _decode_user_from_request(request)
        if user:
            actor = user["display"]
            email = user["email"]
        elif body_bytes:
            email = _extract_email_from_body_for_login(body_bytes)
            actor = email.split("@")[0] if email else "anonymous"
        else:
            actor = "Someone"
            email = None

        # Get the human-readable action description
        action = _describe_action(method, path)
        if action is None:
            # Unknown endpoint — use a generic description
            action = f"{method} {path}"

        status = response.status_code
        status_icon = "✗" if status >= 400 else "✓"

        # Client IP
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not ip and request.client:
            ip = request.client.host

        # Human-readable message on one line, machine tail after `|` for parsing
        human = f"{actor}: {action}"
        if status >= 400:
            human += f" — failed ({status})"

        tail = f"| email={email or '-'} method={method} path={path} status={status} duration_ms={duration_ms} ip={ip or '-'}"

        log_level = logger.warning if status >= 400 else logger.info
        log_level("%s %s %s", status_icon, human, tail)

        return response
