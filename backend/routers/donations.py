from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import stripe
import os
from datetime import datetime, timedelta
from calendar import monthrange
from dotenv import load_dotenv

from database import get_db
from models import Donation, DonationSubscription
from schemas import DonationCreate, DonationResponse, PaymentCreate, PaymentSession, ZakatCalculation, ZakatResult, SubscriptionCreate, SubscriptionSession
from auth_utils import get_current_admin
from pdf_service import generate_donation_certificate
from email_service import send_donation_certificate_email

load_dotenv()

# Configure Stripe API key
stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")
if stripe_secret_key and stripe_secret_key.startswith(('sk_test_', 'sk_live_')):
    stripe.api_key = stripe_secret_key

router = APIRouter()


def generate_certificate(donation: Donation, db: Session) -> str:
    """
    Generate PDF certificate for a donation (without sending email)
    
    Args:
        donation: Donation object
        db: Database session
        
    Returns:
        Path to the generated PDF file
    """
    try:
        # Ensure donated_at is set
        if not donation.donated_at:
            donation.donated_at = datetime.utcnow()
        
        # Create certificates directory if it doesn't exist
        certificates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certificates")
        os.makedirs(certificates_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = donation.donated_at.strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in donation.name)
        safe_name = safe_name.replace(' ', '_')[:50]  # Limit length
        filename = f"certificate_{donation.id}_{safe_name}_{timestamp}.pdf"
        filepath = os.path.join(certificates_dir, filename)
        
        # Generate PDF certificate
        generate_donation_certificate(
            donor_name=donation.name,
            amount=donation.amount,
            donation_date=donation.donated_at,
            output_path=filepath
        )
        
        # Update donation record with certificate filename
        donation.certificate_filename = filename
        db.commit()
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Certificate generated successfully for donation {donation.id}")
        
        return filepath
        
    except Exception as e:
        # Log error but don't fail the donation processing
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to generate certificate for donation {donation.id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise


def email_certificate(donation: Donation) -> bool:
    """
    Send certificate via email for a donation
    
    Args:
        donation: Donation object with certificate_filename set
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        if not donation.certificate_filename:
            raise ValueError("Certificate not generated for this donation")
        
        # Get the certificate file path
        certificates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certificates")
        filepath = os.path.join(certificates_dir, donation.certificate_filename)
        
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Certificate file not found: {filepath}")
        
        # Send email with PDF attachment
        success = send_donation_certificate_email(
            email=donation.email,
            name=donation.name,
            amount=donation.amount,
            pdf_path=filepath
        )
        
        import logging
        logger = logging.getLogger(__name__)
        if success:
            logger.info(f"Certificate emailed successfully for donation {donation.id}")
        else:
            logger.warning(f"Failed to email certificate for donation {donation.id}")
        
        return success
        
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to email certificate for donation {donation.id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False


@router.post("/", response_model=DonationResponse)
async def create_donation(donation: DonationCreate, db: Session = Depends(get_db)):
    db_donation = Donation(**donation.dict())
    db.add(db_donation)
    db.commit()
    db.refresh(db_donation)
    return db_donation


@router.get("/", response_model=List[DonationResponse])
async def get_donations(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    donations = db.query(Donation).offset(skip).limit(limit).all()
    return donations


@router.get("/stats")
async def get_donation_stats(db: Session = Depends(get_db)):
    from models import Setting
    
    total_donations = db.query(func.sum(Donation.amount)).scalar() or 0
    total_donors = db.query(Donation.email).distinct().count()
    recent_donations = db.query(Donation).order_by(Donation.donated_at.desc()).limit(5).all()
    
    # Get impact stats from settings
    settings = db.query(Setting).filter(Setting.key.in_([
        'meals_provided',
        'families_supported', 
        'orphans_cared_for',
        'total_raised'
    ])).all()
    
    settings_dict = {s.key: s.value for s in settings}
    
    return {
        "total_donations": total_donations,
        "total_donors": total_donors,
        "recent_donations": recent_donations,
        "total_raised": float(settings_dict.get('total_raised', '0')),
        "impact": {
            "meals": int(settings_dict.get('meals_provided', '0')),
            "families": int(settings_dict.get('families_supported', '0')),
            "orphans": int(settings_dict.get('orphans_cared_for', '0'))
        }
    }


@router.post("/calculate-zakat", response_model=ZakatResult)
async def calculate_zakat(calculation: ZakatCalculation):
    # Sum all zakatable assets
    total_assets = (
        calculation.cash +
        calculation.receivables +
        calculation.stocks +
        calculation.retirement +
        (calculation.gold_weight * calculation.gold_price_per_gram) +
        (calculation.silver_weight * calculation.silver_price_per_gram) +
        calculation.business_goods +
        calculation.agriculture_value +
        calculation.investment_property +
        calculation.other_valuables +
        calculation.livestock +
        calculation.other_assets
    )
    
    net_assets = max(total_assets - calculation.liabilities, 0)
    
    # Zakat calculations
    wealth_zakat = max(
        (calculation.cash + calculation.receivables + calculation.stocks + 
         calculation.retirement + calculation.investment_property + 
         calculation.other_valuables + calculation.livestock + 
         calculation.other_assets - calculation.liabilities), 0
    ) * 0.025 if any([calculation.cash, calculation.receivables, calculation.stocks, 
                      calculation.retirement, calculation.investment_property, 
                      calculation.other_valuables, calculation.livestock, 
                      calculation.other_assets]) else 0
    
    gold_zakat = (calculation.gold_weight * calculation.gold_price_per_gram) * 0.025 if calculation.gold_weight and calculation.gold_price_per_gram else 0
    silver_zakat = (calculation.silver_weight * calculation.silver_price_per_gram) * 0.025 if calculation.silver_weight and calculation.silver_price_per_gram else 0
    business_zakat = calculation.business_goods * 0.025 if calculation.business_goods else 0
    agriculture_zakat = calculation.agriculture_value * 0.05 if calculation.agriculture_value else 0
    
    total_zakat = wealth_zakat + gold_zakat + silver_zakat + business_zakat + agriculture_zakat
    
    return ZakatResult(
        wealth=wealth_zakat,
        gold=gold_zakat,
        silver=silver_zakat,
        business_goods=business_zakat,
        agriculture=agriculture_zakat,
        total=total_zakat
    )


@router.post("/create-payment-session", response_model=PaymentSession)
async def create_payment_session(payment: PaymentCreate, db: Session = Depends(get_db)):
    # Validate amount
    if not payment.amount or payment.amount < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid amount"
        )
    
    # Check if Stripe is configured
    if not stripe.api_key or not stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing is not configured. Please contact support."
        )
    
    try:
        # Get frontend URL from environment
        frontend_url = os.getenv("FRONTEND_URL", "https://myzakat.org")
        
        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"{payment.purpose} - {payment.frequency}",
                        "description": f"Donation from {payment.name}",
                    },
                    "unit_amount": int(payment.amount * 100),  # Convert to cents
                },
                "quantity": 1,
            }],
            mode="payment",
            customer_email=payment.email,
            metadata={
                "purpose": payment.purpose,
                "frequency": payment.frequency,
                "donor_name": payment.name,
                "donor_email": payment.email
            },
            success_url=f"{frontend_url}/donation-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/donate",
        )
        
        # Create a pending donation record immediately (fallback for webhook issues)
        # This will be updated by webhook when payment is confirmed
        try:
            pending_donation = Donation(
                name=payment.name,
                email=payment.email,
                amount=payment.amount,
                frequency=f"Pending - {payment.frequency}",
                stripe_session_id=checkout_session.id
            )
            db.add(pending_donation)
            db.commit()
        except Exception as e:
            db.rollback()
        
        return PaymentSession(id=checkout_session.id)
        
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing error: {str(e)}"
        )


def calculate_next_payment_date(payment_day: int, payment_month: Optional[int] = None, interval: str = "month") -> datetime:
    """Calculate the next payment date based on interval and payment day/month"""
    now = datetime.utcnow()
    
    if interval == "month":
        # For monthly payments, find next occurrence of payment_day
        year = now.year
        month = now.month
        
        # Ensure payment_day doesn't exceed days in month
        max_day = monthrange(year, month)[1]
        actual_day = min(payment_day, max_day)
        
        try:
            next_date = datetime(year, month, actual_day)
            if next_date <= now:
                # Move to next month
                if month == 12:
                    year += 1
                    month = 1
                else:
                    month += 1
                max_day = monthrange(year, month)[1]
                actual_day = min(payment_day, max_day)
                next_date = datetime(year, month, actual_day)
        except ValueError:
            # Handle edge case for invalid dates
            next_date = datetime(year, month, min(payment_day, 28))
            
        return next_date
        
    elif interval == "year":
        # For annual payments, find next occurrence of payment_month and payment_day
        if not payment_month:
            payment_month = 1
            
        year = now.year
        max_day = monthrange(year, payment_month)[1]
        actual_day = min(payment_day, max_day)
        
        try:
            next_date = datetime(year, payment_month, actual_day)
            if next_date <= now:
                year += 1
                max_day = monthrange(year, payment_month)[1]
                actual_day = min(payment_day, max_day)
                next_date = datetime(year, payment_month, actual_day)
        except ValueError:
            next_date = datetime(year, payment_month, min(payment_day, 28))
            
        return next_date
    
    return now + timedelta(days=30)  # fallback


@router.post("/create-subscription", response_model=SubscriptionSession)
async def create_subscription(subscription: SubscriptionCreate, db: Session = Depends(get_db)):
    # Validate input
    if not subscription.amount or subscription.amount < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid amount"
        )
    
    if subscription.interval not in ["month", "year"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interval must be 'month' or 'year'"
        )
    
    if subscription.payment_day < 1 or subscription.payment_day > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment day must be between 1 and 31"
        )
    
    if subscription.interval == "year" and subscription.payment_month:
        if subscription.payment_month < 1 or subscription.payment_month > 12:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment month must be between 1 and 12"
            )
    
    # Check if Stripe is configured
    if not stripe.api_key or not stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing is not configured. Please contact support."
        )
    
    try:
        frontend_url = os.getenv("FRONTEND_URL", "https://myzakat.org")
        
        # Create or retrieve customer
        customer = stripe.Customer.create(
            email=subscription.email,
            name=subscription.name,
            metadata={
                "purpose": subscription.purpose,
                "payment_day": str(subscription.payment_day),
                "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
            }
        )
        
        # Create product first
        product = stripe.Product.create(
            name=f"{subscription.purpose} - {subscription.interval.title()}ly Donation",
            description=f"Recurring {subscription.purpose} donation from {subscription.name}",
            metadata={
                "purpose": subscription.purpose,
                "donor_name": subscription.name,
                "payment_day": str(subscription.payment_day),
                "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
            }
        )
        
        # Create price for the subscription
        price = stripe.Price.create(
            unit_amount=int(subscription.amount * 100),  # Convert to cents
            currency="usd",
            recurring={
                "interval": subscription.interval,
                "interval_count": 1,
            },
            product=product.id,
            metadata={
                "purpose": subscription.purpose,
                "donor_name": subscription.name,
                "payment_day": str(subscription.payment_day),
                "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
            }
        )
        
        # Create checkout session for subscription - charge immediately, set billing cycle after
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": price.id,
                "quantity": 1,
            }],
            mode="subscription",
            customer=customer.id,
            subscription_data={
                "metadata": {
                    "purpose": subscription.purpose,
                    "donor_name": subscription.name,
                    "payment_day": str(subscription.payment_day),
                    "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
                }
            },
            success_url=f"{frontend_url}/donation-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/donate",
            metadata={
                "type": "subscription",
                "purpose": subscription.purpose,
                "donor_name": subscription.name,
                "payment_day": str(subscription.payment_day),
                "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
            }
        )
        
        # Create pending subscription record immediately (fallback for webhook issues)
        # This will be updated by webhook when subscription is confirmed
        try:
            # Calculate next payment for pending record
            next_payment = calculate_next_payment_date(
                subscription.payment_day,
                subscription.payment_month,
                subscription.interval
            )
            
            pending_subscription = DonationSubscription(
                stripe_subscription_id=f"pending_{checkout_session.id}",
                stripe_customer_id=customer.id,
                stripe_session_id=checkout_session.id,
                name=subscription.name,
                email=subscription.email,
                amount=subscription.amount,
                purpose=subscription.purpose,
                interval=subscription.interval,
                payment_day=subscription.payment_day,
                payment_month=subscription.payment_month,
                status="pending",
                next_payment_date=next_payment
            )
            db.add(pending_subscription)
            
            # Also create a donation record for the subscription
            pending_donation = Donation(
                name=subscription.name,
                email=subscription.email,
                amount=subscription.amount,
                frequency=f"Recurring {subscription.interval}ly - Pending",
                stripe_session_id=checkout_session.id
            )
            db.add(pending_donation)
            
            db.commit()
        except Exception as e:
            db.rollback()
        
        return SubscriptionSession(id=checkout_session.id)
        
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Subscription processing error: {str(e)}"
        )


@router.post("/cancel-subscription")
async def cancel_subscription(request: dict, db: Session = Depends(get_db)):
    """Cancel a subscription"""
    if not stripe.api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing is not configured."
        )
    
    subscription_id = request.get("subscription_id")
    if not subscription_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription ID is required"
        )
    
    try:
        # Cancel subscription in Stripe
        stripe.Subscription.cancel(subscription_id)
        
        # Update local database
        db_subscription = db.query(DonationSubscription).filter(
            DonationSubscription.stripe_subscription_id == subscription_id
        ).first()
        
        if db_subscription:
            db_subscription.status = "canceled"
            db_subscription.updated_at = datetime.utcnow()
            db.commit()
        
        return {"status": "success", "message": "Subscription canceled"}
        
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel subscription: {str(e)}"
        )


@router.get("/subscriptions", response_model=List[dict])
async def get_subscriptions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Get all donation subscriptions (admin only)"""
    subscriptions = db.query(DonationSubscription).offset(skip).limit(limit).all()
    
    return [{
        "id": sub.id,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "name": sub.name,
        "email": sub.email,
        "amount": sub.amount,
        "purpose": sub.purpose,
        "interval": sub.interval,
        "payment_day": sub.payment_day,
        "payment_month": sub.payment_month,
        "status": sub.status,
        "created_at": sub.created_at,
        "next_payment_date": sub.next_payment_date,
    } for sub in subscriptions]


@router.post("/update-subscription-status")
async def update_subscription_status(db: Session = Depends(get_db)):
    """Update subscription status from Stripe"""
    if not stripe.api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe not configured"
        )
    
    try:
        # Get all pending subscriptions
        pending_subs = db.query(DonationSubscription).filter(
            DonationSubscription.status == "pending"
        ).all()
        
        updated_count = 0
        for sub in pending_subs:
            if sub.stripe_subscription_id.startswith("pending_"):
                # Try to find the actual subscription ID
                session_id = sub.stripe_subscription_id.replace("pending_", "")
                try:
                    session = stripe.checkout.Session.retrieve(session_id)
                    if session.subscription:
                        stripe_sub = stripe.Subscription.retrieve(session.subscription)
                        sub.stripe_subscription_id = session.subscription
                        sub.status = stripe_sub.status
                        sub.updated_at = datetime.utcnow()
                        updated_count += 1
                except:
                    continue
            else:
                # Update status from existing subscription ID
                try:
                    stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
                    if sub.status != stripe_sub.status:
                        sub.status = stripe_sub.status
                        sub.updated_at = datetime.utcnow()
                        updated_count += 1
                except:
                    continue
        
        db.commit()
        return {"status": "success", "updated": updated_count}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Update failed: {str(e)}"
        )


@router.get("/sync-debug")
async def sync_debug_info(current_admin = Depends(get_current_admin)):
    """Debug info for Stripe sync (development only)"""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debug endpoint disabled in production"
        )
    
    return {
        "environment": environment,
        "stripe_configured": bool(stripe.api_key),
        "stripe_key_prefix": stripe.api_key[:7] + "..." if stripe.api_key else None,
        "stripe_secret_key_env": bool(os.getenv("STRIPE_SECRET_KEY"))
    }

@router.post("/sync-stripe-data")
async def sync_stripe_data(db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
    """Manually sync recent Stripe data (development helper)"""
    # Only allow in development/local environment
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Stripe sync is disabled in production"
        )
    
    if not stripe.api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe not configured"
        )
    
    try:
        # Get recent checkout sessions
        sessions = stripe.checkout.Session.list(limit=20)
        synced_count = 0
        
        for session in sessions.data:
            if session.payment_status == "paid":
                if session.mode == "payment":
                    # One-time payment
                    existing = db.query(Donation).filter(
                        Donation.email == session.customer_email,
                        Donation.amount == session.amount_total / 100.0
                    ).first()
                    
                    if not existing:
                        # Handle missing customer details gracefully
                        customer_name = "Unknown"
                        if session.customer_details and hasattr(session.customer_details, 'name'):
                            customer_name = session.customer_details.name or "Unknown"
                        
                        donation = Donation(
                            name=customer_name,
                            email=session.customer_email or "unknown@example.com",
                            amount=session.amount_total / 100.0,
                            frequency="One-Time (Synced)"
                        )
                        db.add(donation)
                        synced_count += 1
                        
                elif session.mode == "subscription" and session.subscription:
                    # Subscription
                    existing = db.query(DonationSubscription).filter(
                        DonationSubscription.stripe_subscription_id == session.subscription
                    ).first()
                    
                    if not existing:
                        try:
                            stripe_sub = stripe.Subscription.retrieve(session.subscription)
                            customer = stripe.Customer.retrieve(session.customer)
                            
                            # Handle missing customer data gracefully
                            customer_name = "Unknown"
                            customer_email = "unknown@example.com"
                            
                            if hasattr(customer, 'name') and customer.name:
                                customer_name = customer.name
                            if hasattr(customer, 'email') and customer.email:
                                customer_email = customer.email
                            
                            # Handle subscription data safely
                            amount = 0.0
                            interval = "month"
                            if stripe_sub.items and stripe_sub.items.data:
                                price = stripe_sub.items.data[0].price
                                if price.unit_amount:
                                    amount = price.unit_amount / 100.0
                                if price.recurring and price.recurring.interval:
                                    interval = price.recurring.interval
                            
                            subscription = DonationSubscription(
                                stripe_subscription_id=session.subscription,
                                stripe_customer_id=session.customer,
                                name=customer_name,
                                email=customer_email,
                                amount=amount,
                                purpose="General Donation (Synced)",
                                interval=interval,
                                payment_day=1,  # Default
                                status=stripe_sub.status,
                                next_payment_date=datetime.utcfromtimestamp(stripe_sub.current_period_end) if stripe_sub.current_period_end else None
                            )
                            db.add(subscription)
                            synced_count += 1
                        except Exception as sub_error:
                            # Log subscription sync error but continue with other sessions
                            print(f"Error syncing subscription {session.subscription}: {str(sub_error)}")
                            continue
        
        db.commit()
        return {"status": "success", "synced": synced_count}
        
    except Exception as e:
        db.rollback()
        # Log the full error for debugging
        import traceback
        print(f"Stripe sync error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}"
        )



@router.get("/debug-subscriptions")
async def debug_subscriptions(db: Session = Depends(get_db)):
    """Debug endpoint to check subscription records"""
    subscriptions = db.query(DonationSubscription).all()
    return {
        "total_subscriptions": len(subscriptions),
        "subscriptions": [
            {
                "id": sub.id,
                "stripe_subscription_id": sub.stripe_subscription_id,
                "stripe_session_id": sub.stripe_session_id,
                "status": sub.status,
                "email": sub.email
            } for sub in subscriptions
        ]
    }

@router.post("/stripe-webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhooks for payment confirmation"""
    
    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        
        if not webhook_secret:
            return {"status": "webhook secret not configured"}
        
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        
        # Process webhook event
        event_type = event["type"]
        
        # Handle successful checkout session (one-time or subscription setup)
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            session_mode = session.get("mode", "payment")
            session_id = session.get("id")
            
            if session_mode == "payment":
                # One-time payment - update existing pending donation or create new one
                customer_email = session.get("customer_email", "")
                amount = session.get("amount_total", 0) / 100.0
                
                donor_name = ""
                if "metadata" in session and session["metadata"]:
                    donor_name = session["metadata"].get("donor_name", "")
                elif "customer_details" in session and session["customer_details"]:
                    donor_name = session["customer_details"].get("name", "")
                
                frequency = session.get("metadata", {}).get("frequency", "One-Time")
                
                try:
                    # Find and update existing pending donation by session ID
                    existing_donation = db.query(Donation).filter(
                        Donation.stripe_session_id == session_id
                    ).first()
                    
                    if existing_donation:
                        # Update existing pending donation
                        existing_donation.name = donor_name or existing_donation.name
                        existing_donation.email = customer_email or existing_donation.email
                        existing_donation.amount = amount
                        existing_donation.frequency = frequency  # Remove "Pending -" prefix
                        if not existing_donation.donated_at:
                            existing_donation.donated_at = datetime.utcnow()
                        db.commit()
                        
                        # Generate certificate (email is optional, user can request it)
                        db.refresh(existing_donation)
                        generate_certificate(existing_donation, db)
                    else:
                        # Create new donation if not found (fallback)
                        new_donation = Donation(
                            name=donor_name or "Anonymous",
                            email=customer_email,
                            amount=amount,
                            frequency=frequency,
                            stripe_session_id=session_id,
                            donated_at=datetime.utcnow()
                        )
                        db.add(new_donation)
                        db.commit()
                        db.refresh(new_donation)
                        
                        # Generate certificate (email is optional, user can request it)
                        generate_certificate(new_donation, db)
                except Exception as db_error:
                    import logging
                    import traceback
                    logger = logging.getLogger(__name__)
                    logger.error(f"Error processing donation webhook: {str(db_error)}")
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    db.rollback()
                    
            elif session_mode == "subscription":
                # Subscription checkout completed - just mark as processed
                # The actual subscription will be handled by customer.subscription.created
                try:
                    # Update pending subscription to mark checkout as completed
                    existing_subscription = db.query(DonationSubscription).filter(
                        DonationSubscription.stripe_session_id == session_id
                    ).first()
                    
                    if existing_subscription:
                        existing_subscription.status = "checkout_completed"
                        db.commit()
                except Exception as db_error:
                    import logging
                    import traceback
                    logger = logging.getLogger(__name__)
                    logger.error(f"Error processing subscription creation: {str(db_error)}")
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    db.rollback()
        
        # Handle subscription creation (the real subscription setup)
        elif event_type == "customer.subscription.created":
            subscription = event["data"]["object"]
            subscription_id = subscription.get("id")
            customer_id = subscription.get("customer")
            
            try:
                # Get customer and subscription details from Stripe
                customer = stripe.Customer.retrieve(customer_id)
                
                # Get metadata from the subscription or customer
                metadata = subscription.get("metadata", {}) or customer.get("metadata", {})
                amount = subscription["items"]["data"][0]["price"]["unit_amount"] / 100.0
                interval = subscription["items"]["data"][0]["price"]["recurring"]["interval"]
                
                # No custom billing cycle - payments will occur naturally from today
                
                # Find existing pending subscription by customer email or create new one
                existing_subscription = db.query(DonationSubscription).filter(
                    DonationSubscription.email == customer.email,
                    DonationSubscription.status.in_(["pending", "checkout_completed"])
                ).first()
                
                if existing_subscription:
                    # Update existing pending subscription
                    existing_subscription.stripe_subscription_id = subscription_id
                    existing_subscription.stripe_customer_id = customer_id
                    existing_subscription.status = "active"
                    existing_subscription.next_payment_date = None  # Will be set by Stripe naturally
                else:
                    # Create new subscription record
                    db_subscription = DonationSubscription(
                        stripe_subscription_id=subscription_id,
                        stripe_customer_id=customer_id,
                        name=metadata.get("donor_name", customer.name or ""),
                        email=customer.email,
                        amount=amount,
                        purpose=metadata.get("purpose", "General Donation"),
                        interval=interval,
                        payment_day=1,  # Default value
                        payment_month=None,  # Not used
                        status="active",
                        next_payment_date=None  # Will be set by Stripe naturally
                    )
                    db.add(db_subscription)
                
                # Create initial donation record for the subscription
                existing_donation = db.query(Donation).filter(
                    Donation.email == customer.email,
                    Donation.frequency.like("Recurring%Pending")
                ).first()
                
                if existing_donation:
                    # Update existing pending donation
                    existing_donation.frequency = f"Recurring {interval}ly"
                else:
                    # Create new donation record for the subscription
                    donation = Donation(
                        name=metadata.get("donor_name", customer.name or ""),
                        email=customer.email,
                        amount=amount,
                        frequency=f"Recurring {interval}ly"
                    )
                    db.add(donation)
                
                db.commit()
            except Exception as db_error:
                db.rollback()
        
        # Handle successful subscription payment
        elif event_type == "invoice.payment_succeeded":
            invoice = event["data"]["object"]
            subscription_id = invoice.get("subscription")
            
            if subscription_id:
                # Get the actual amount paid (this could be prorated)
                amount_paid = invoice.get("amount_paid", 0) / 100.0
                billing_reason = invoice.get("billing_reason")
                
                # Get subscription details from database
                db_subscription = db.query(DonationSubscription).filter(
                    DonationSubscription.stripe_subscription_id == subscription_id
                ).first()
                
                if db_subscription:
                    try:
                        # Create donation record for the actual payment
                        if billing_reason == "subscription_create":
                            # Initial payment (full amount - no proration)
                            frequency_label = f"Recurring {db_subscription.interval}ly - Initial Payment"
                        else:
                            # Regular recurring payment
                            frequency_label = f"Recurring {db_subscription.interval}ly"
                        
                        donation = Donation(
                            name=db_subscription.name,
                            email=db_subscription.email,
                            amount=amount_paid,  # Use actual amount paid, not subscription amount
                            frequency=frequency_label,
                            donated_at=datetime.utcnow()
                        )
                        db.add(donation)
                        db.flush()  # Flush to get donation ID
                        
                        # Update next payment date
                        next_payment = calculate_next_payment_date(
                            db_subscription.payment_day,
                            db_subscription.payment_month,
                            db_subscription.interval
                        )
                        db_subscription.next_payment_date = next_payment
                        db_subscription.updated_at = datetime.utcnow()
                        
                        db.commit()
                        
                        # Generate certificate (email is optional, user can request it)
                        db.refresh(donation)
                        generate_certificate(donation, db)
                    except Exception as db_error:
                        import logging
                        import traceback
                        logger = logging.getLogger(__name__)
                        logger.error(f"Error processing subscription payment: {str(db_error)}")
                        logger.error(f"Traceback: {traceback.format_exc()}")
                        db.rollback()
        
        # Handle failed subscription payment
        elif event_type == "invoice.payment_failed":
            invoice = event["data"]["object"]
            subscription_id = invoice.get("subscription")
            
            if subscription_id:
                db_subscription = db.query(DonationSubscription).filter(
                    DonationSubscription.stripe_subscription_id == subscription_id
                ).first()
                
                if db_subscription:
                    db_subscription.status = "past_due"
                    db_subscription.updated_at = datetime.utcnow()
                    db.commit()
        
        # Handle subscription cancellation
        elif event_type == "customer.subscription.deleted":
            subscription = event["data"]["object"]
            subscription_id = subscription.get("id")
            
            if subscription_id:
                db_subscription = db.query(DonationSubscription).filter(
                    DonationSubscription.stripe_subscription_id == subscription_id
                ).first()
                
                if db_subscription:
                    db_subscription.status = "canceled"
                    db_subscription.updated_at = datetime.utcnow()
                    db.commit()
        
        return {"status": "success"}
        
    except stripe.error.SignatureVerificationError:
        return {"status": "signature verification failed"}, 400
    except Exception:
        return {"status": "webhook error"}, 500
