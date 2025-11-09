from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import stripe
import os
from io import BytesIO
from dotenv import load_dotenv

from database import get_db
from models import User, Donation, DonationSubscription
from schemas import DonationResponse
from auth_utils import get_current_user
from pdf_service import generate_donation_certificate_to_bytes

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
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Fetching donations for user: {current_user.email}")
    
    donations = db.query(Donation).filter(
        Donation.email == current_user.email
    ).order_by(Donation.donated_at.desc()).all()
    
    logger.info(f"Found {len(donations)} donations for user {current_user.email}")
    if len(donations) > 0:
        logger.info(f"Sample donation emails: {[d.email for d in donations[:3]]}")
    
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


@router.get("/certificate/{donation_id}")
async def download_certificate(
    donation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download PDF certificate for a donation (generated on-the-fly)"""
    
    # Find the donation and verify ownership
    donation = db.query(Donation).filter(
        Donation.id == donation_id,
        Donation.email == current_user.email
    ).first()
    
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found or you don't have permission to access it"
        )
    
    # Ensure donated_at is set
    if not donation.donated_at:
        donation.donated_at = datetime.utcnow()
        db.commit()
    
    try:
        # Generate PDF certificate on-the-fly (no file storage)
        pdf_bytes = generate_donation_certificate_to_bytes(
            donor_name=donation.name,
            amount=donation.amount,
            donation_date=donation.donated_at
        )
        
        # Return PDF as streaming response
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="donation_certificate_{donation.id}.pdf"'
            }
        )
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to generate certificate for donation {donation.id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate certificate: {str(e)}"
        )


@router.post("/regenerate-certificate/{donation_id}")
async def regenerate_certificate(
    donation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate certificate for an existing donation (no longer needed - certificates are generated on-the-fly)"""
    
    # Find the donation and verify ownership
    donation = db.query(Donation).filter(
        Donation.id == donation_id,
        Donation.email == current_user.email
    ).first()
    
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found or you don't have permission to access it"
        )
    
    # Certificates are now generated on-the-fly, so this endpoint just confirms the donation exists
    # We can optionally mark it as having a certificate available
    if not donation.certificate_filename:
        donation.certificate_filename = "available"  # Mark as available for download
        db.commit()
    
    return {"status": "success", "message": "Certificate is available for download"}


@router.post("/email-certificate/{donation_id}")
async def email_certificate_endpoint(
    donation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send certificate via email for an existing donation (generated on-the-fly)"""
    
    # Find the donation and verify ownership
    donation = db.query(Donation).filter(
        Donation.id == donation_id,
        Donation.email == current_user.email
    ).first()
    
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found or you don't have permission to access it"
        )
    
    # Import the email function
    from routers.donations import email_certificate
    
    try:
        # Send email with certificate (generated on-the-fly)
        success = email_certificate(donation)
        if success:
            return {"status": "success", "message": "Certificate emailed successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send email. Please check server logs."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to email certificate: {str(e)}"
        )

