from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from database import get_db
from models import User

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    import warnings
    if os.getenv("TESTING", "false").lower() == "true":
        SECRET_KEY = "test-secret-key-not-for-production"
    elif os.getenv("ENVIRONMENT", "development").lower() == "production":
        raise RuntimeError("SECRET_KEY environment variable must be set in production")
    else:
        warnings.warn("SECRET_KEY not set — using insecure default for development only")
        SECRET_KEY = "dev-only-insecure-secret-key"
ALGORITHM = "HS256"
# Increase token expiration to 7 days for better UX
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days default

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

# HttpOnly session cookie for byte-serving media routes.
#
# `<img>`/`<video>` tags can't attach an Authorization header, so private media
# would 404 for every signed-in browser session even though the API call that
# fetches the asset's metadata (which *does* go through axios with the header)
# succeeds. Login mirrors the JWT into this cookie, scoped to the media routes
# only, so the browser sends it automatically on those subresource requests.
# It is read by `get_optional_user` only — `get_current_user` and every other
# dependency keep requiring the Authorization header exactly as before.
MEDIA_SESSION_COOKIE = "media_session"
MEDIA_SESSION_COOKIE_PATH = "/api/media-library"


def is_production() -> bool:
    return os.getenv("ENVIRONMENT", "development") == "production"


VALID_ROLES = frozenset({"admin", "manager", "field_staff", "user"})
STAFF_ROLES = frozenset({"admin", "manager", "field_staff"})
MANAGER_ROLES = frozenset({"admin", "manager"})


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    # Bcrypt has a 72-byte limit
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token for any user"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# Claim value marking a token as a submitter-portal session rather than a staff
# session. Staff tokens carry no `typ` at all, which reads as "user" below, so
# existing sessions keep working untouched.
PORTAL_TOKEN_TYPE = "proposal_portal"
PORTAL_TOKEN_MINUTES = 30


def verify_token(token: str):
    """Verify a STAFF JWT and return its subject email.

    Scoped tokens are refused here even though their signature is valid.
    Without this check, a proposal-portal token minted for an address that also
    belongs to a staff account would resolve to that User in get_current_user,
    and a six-digit emailed code would be enough to reach the admin console.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ", "user") != "user":
            return None
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError as e:
        # Log the error for debugging but don't print sensitive info
        import logging
        logging.error(f"JWT verification failed: {str(e)}")
        return None


def create_portal_token(email: str, expires_delta: Optional[timedelta] = None) -> str:
    """Mint a submitter-portal token: short-lived, and not a user session."""
    return create_access_token(
        {"sub": email, "typ": PORTAL_TOKEN_TYPE},
        expires_delta=expires_delta or timedelta(minutes=PORTAL_TOKEN_MINUTES),
    )


def verify_portal_token(token: str) -> Optional[str]:
    """The mirror of verify_token: only a portal token resolves, to its email."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != PORTAL_TOKEN_TYPE:
        return None
    return payload.get("sub")


def get_portal_email(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """FastAPI dependency for portal routes. Yields the verified email.

    No database lookup: a submitter has no row anywhere. The email in the token
    IS the identity, and every portal query filters on it.
    """
    email = verify_portal_token(credentials.credentials)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return email


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    email = verify_token(credentials.credentials)
    if email is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    
    return user


def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db)
):
    """Current user if a valid token is present, otherwise None.

    Used by routes that serve public content to anonymous callers but must still
    recognise a signed-in owner. The token can come from either the
    `Authorization: Bearer` header (used by the axios API client) or the
    `media_session` HttpOnly cookie (used by plain `<img>`/`<video>` requests,
    which cannot carry a custom header). The header wins when both are present.
    """
    token = credentials.credentials if credentials is not None else request.cookies.get(MEDIA_SESSION_COOKIE)
    if not token:
        return None
    email = verify_token(token)
    if email is None:
        return None
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        return None
    return user


def get_current_admin(
    current_user: User = Depends(get_current_user)
):
    """Get current user and verify they have admin privileges.

    Deliberately checks `is_admin` directly rather than going through
    `role_of` — admin is the one role every legacy row can already assert
    correctly, so this gate predates (and doesn't need) the helper.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Admin access required."
        )

    return current_user


def role_of(user: User) -> str:
    """Effective role for a user row.

    Prefers the `role` column, falling back to the legacy `is_admin` flag for
    rows created before migration 21 added the column.
    """
    role = getattr(user, "role", None)
    if role in VALID_ROLES:
        return role
    return "admin" if getattr(user, "is_admin", False) else "user"


def get_current_staff(
    current_user: User = Depends(get_current_user)
) -> User:
    """Anyone who owns a media workspace: admin, manager or field staff."""
    if role_of(current_user) not in STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Staff access required."
        )
    return current_user


def get_current_manager_or_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Allow either admins or managers — used for endpoints that managers can access."""
    if role_of(current_user) not in MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Manager or admin access required."
        )

    return current_user
