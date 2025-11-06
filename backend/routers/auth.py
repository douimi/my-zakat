from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
import secrets

from database import get_db
from models import User
from schemas import UserRegister, UserLogin, UserResponse, Token, ResendVerificationRequest
from auth_utils import verify_password, create_access_token, get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user
from email_service import send_verification_email

router = APIRouter()


# User Registration
@router.post("/register", response_model=UserResponse)
async def register_user(user: UserRegister, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = get_password_hash(user.password)
    
    # Generate verification token
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires = datetime.utcnow() + timedelta(days=7)  # Token expires in 7 days
    
    # Create new user
    db_user = User(
        email=user.email,
        password=hashed_password,
        name=user.name,
        is_active=True,
        is_admin=False,
        email_verified=False,
        verification_token=verification_token,
        verification_token_expires=verification_token_expires
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Send verification email
    try:
        send_verification_email(user.email, user.name, verification_token)
    except Exception as e:
        # Log error but don't fail registration
        import logging
        logging.error(f"Failed to send verification email: {str(e)}")
    
    return db_user


# User Login (works for both regular users and admins)
@router.post("/login", response_model=Token)
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_login.email).first()
    
    if not user or not verify_password(user_login.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Check if email is verified (skip for admin users)
    if not user.is_admin and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your email for the verification link."
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


# Get current user info
@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user


# Verify email address
@router.get("/verify-email")
async def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Verify user's email address using verification token
    """
    user = db.query(User).filter(User.verification_token == token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified"
        )
    
    if user.verification_token_expires and user.verification_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired. Please request a new verification email."
        )
    
    # Mark email as verified
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    
    return {"message": "Email verified successfully"}


# Resend verification email
@router.post("/resend-verification")
async def resend_verification_email(request: ResendVerificationRequest, db: Session = Depends(get_db)):
    """
    Resend verification email to user
    """
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        # Don't reveal if email exists or not for security
        return {"message": "If the email exists and is not verified, a verification email has been sent."}
    
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified"
        )
    
    # Generate new verification token
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires = datetime.utcnow() + timedelta(days=7)
    
    user.verification_token = verification_token
    user.verification_token_expires = verification_token_expires
    db.commit()
    
    # Send verification email
    try:
        send_verification_email(user.email, user.name, verification_token)
    except Exception as e:
        import logging
        logging.error(f"Failed to send verification email: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please try again later."
        )
    
    return {"message": "Verification email sent successfully"}

