from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import stripe
import os
from dotenv import load_dotenv

from database import get_db
from models import User, Donation, DonationSubscription
from schemas import DonationResponse
from auth_utils import get_current_user

load_dotenv()

stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")
if stripe_secret_key and stripe_secret_key.startswith(('sk_test_', 'sk_live_')):
    stripe.api_key = stripe_secret_key

router = APIRouter()


@router.get("/donations", response_model=List[DonationResponse])
async def get_user_donations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all donations made by the current user"""
    donations = db.query(Donation).filter(
        Donation.email == current_user.email
    ).order_by(Donation.donated_at.desc()).all()
    
    return donations


@router.get("/subscriptions")
async def get_user_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all active subscriptions for the current user"""
    subscriptions = db.query(DonationSubscription).filter(
        DonationSubscription.email == current_user.email,
        DonationSubscription.status.in_(["active", "past_due"])
    ).order_by(DonationSubscription.created_at.desc()).all()
    
    return [{
        "id": sub.id,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "amount": sub.amount,
        "purpose": sub.purpose,
        "interval": sub.interval,
        "payment_day": sub.payment_day,
        "payment_month": sub.payment_month,
        "status": sub.status,
        "created_at": sub.created_at,
        "next_payment_date": sub.next_payment_date,
    } for sub in subscriptions]


@router.get("/all-subscriptions")
async def get_all_user_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all subscriptions (including canceled) for the current user"""
    subscriptions = db.query(DonationSubscription).filter(
        DonationSubscription.email == current_user.email
    ).order_by(DonationSubscription.created_at.desc()).all()
    
    return [{
        "id": sub.id,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "amount": sub.amount,
        "purpose": sub.purpose,
        "interval": sub.interval,
        "payment_day": sub.payment_day,
        "payment_month": sub.payment_month,
        "status": sub.status,
        "created_at": sub.created_at,
        "next_payment_date": sub.next_payment_date,
    } for sub in subscriptions]


@router.post("/cancel-subscription/{subscription_id}")
async def cancel_user_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a subscription owned by the current user"""
    
    # Find the subscription
    subscription = db.query(DonationSubscription).filter(
        DonationSubscription.id == subscription_id,
        DonationSubscription.email == current_user.email
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found or you don't have permission to cancel it"
        )
    
    if subscription.status == "canceled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is already canceled"
        )
    
    # Cancel in Stripe
    if stripe.api_key and subscription.stripe_subscription_id:
        try:
            # Don't cancel pending subscriptions
            if not subscription.stripe_subscription_id.startswith("pending_"):
                stripe.Subscription.cancel(subscription.stripe_subscription_id)
        except stripe.error.StripeError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to cancel subscription in Stripe: {str(e)}"
            )
    
    # Update in database
    from datetime import datetime
    subscription.status = "canceled"
    subscription.updated_at = datetime.utcnow()
    db.commit()
    
    return {"status": "success", "message": "Subscription canceled successfully"}


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for the current user"""
    from sqlalchemy import func
    
    # Total donations
    total_donated = db.query(func.sum(Donation.amount)).filter(
        Donation.email == current_user.email
    ).scalar() or 0
    
    # Count of donations
    donation_count = db.query(Donation).filter(
        Donation.email == current_user.email
    ).count()
    
    # Active subscriptions count
    active_subscriptions = db.query(DonationSubscription).filter(
        DonationSubscription.email == current_user.email,
        DonationSubscription.status == "active"
    ).count()
    
    # Recent donations
    recent_donations = db.query(Donation).filter(
        Donation.email == current_user.email
    ).order_by(Donation.donated_at.desc()).limit(5).all()
    
    return {
        "total_donated": float(total_donated),
        "donation_count": donation_count,
        "active_subscriptions": active_subscriptions,
        "recent_donations": [{
            "id": d.id,
            "amount": d.amount,
            "frequency": d.frequency,
            "donated_at": d.donated_at
        } for d in recent_donations]
    }

