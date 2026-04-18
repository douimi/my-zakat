"""
Audit logging middleware for MyZakat.

Logs every state-changing request (POST/PUT/PATCH/DELETE) with:
  - Admin / user email (decoded from JWT if present)
  - HTTP method + path
  - Response status code
  - Duration in milliseconds
  - Client IP address

Uses the structured format "AUDIT | email | METHOD path -> status (duration)"
so Promtail/Loki can filter by the "AUDIT" marker and extract fields in Grafana.

Read-only GET requests are NOT logged here to avoid log spam; specific
read endpoints already log through the regular application logger.
"""
import time
import os
from typing import Optional

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
    "/api/donations/stripe-webhook",
    "/api/auth/me",
    "/api/user/dashboard-stats",
)

# Methods that don't modify state — we skip these to reduce noise
READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def _decode_user_from_request(request: Request) -> Optional[dict]:
    """Extract the user's email from the JWT in the Authorization header.

    Returns a dict with email and is_admin, or None if no valid token.
    Does NOT raise — auth failures just mean we log the request as anonymous.
    """
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

    # Look up the user to get is_admin flag
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            return {
                "email": user.email,
                "is_admin": user.is_admin,
                "user_id": user.id,
            }
    except Exception:
        pass
    finally:
        db.close()

    return {"email": email, "is_admin": False, "user_id": None}


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs every state-changing request with user context."""

    async def dispatch(self, request: Request, call_next):
        # Skip noise paths
        path = request.url.path
        if any(path.startswith(p) for p in SKIP_PATHS):
            return await call_next(request)

        # Skip pure read methods
        method = request.method
        if method in READ_METHODS:
            return await call_next(request)

        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        # Extract user context (best-effort)
        user = _decode_user_from_request(request)
        actor = user["email"] if user else "anonymous"
        role = (
            "admin" if user and user.get("is_admin")
            else "user" if user
            else "anonymous"
        )

        # Client IP (respects X-Forwarded-For if behind Traefik)
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip and request.client:
            client_ip = request.client.host

        # Log format — easy to parse in Loki/Grafana
        logger.info(
            "AUDIT | actor=%s role=%s method=%s path=%s status=%s duration_ms=%s ip=%s",
            actor,
            role,
            method,
            path,
            response.status_code,
            duration_ms,
            client_ip or "-",
        )

        return response
