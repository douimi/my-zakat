from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
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
from pdf_service import generate_donation_certificate, generate_donation_certificate_to_bytes
from email_service import send_donation_certificate_email
from logging_config import get_logger

load_dotenv()

# Track processed webhook event IDs to prevent duplicate processing from Stripe retries.
# In production with multiple workers, consider using Redis or a DB table instead.
_processed_events: set = set()
_MAX_PROCESSED_EVENTS = 5000  # Cap memory usage

logger = get_logger(__name__)

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
        
        logger.info("Certificate generated successfully for donation %s", donation.id)

        return filepath

    except Exception as e:
        # Log error but don't fail the donation processing
        import traceback
        logger.error("Failed to generate certificate for donation %s: %s", donation.id, str(e))
        logger.error("Traceback: %s", traceback.format_exc())
        raise


def email_certificate(donation: Donation) -> bool:
    """
    Send certificate via email for a donation (generated on-the-fly)
    
    Args:
        donation: Donation object
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Ensure donated_at is set
        if not donation.donated_at:
            donation.donated_at = datetime.utcnow()
        
        # Generate PDF certificate on-the-fly (no file storage)
        pdf_bytes = generate_donation_certificate_to_bytes(
            donor_name=donation.name,
            amount=donation.amount,
            donation_date=donation.donated_at
        )
        
        # Create temporary file for email attachment
        import tempfile
        certificates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certificates")
        os.makedirs(certificates_dir, exist_ok=True)
        
        with tempfile.NamedTemporaryFile(
            mode='wb',
            suffix='.pdf',
            dir=certificates_dir,
            delete=False
        ) as temp_file:
            temp_file.write(pdf_bytes)
            temp_path = temp_file.name
        
        try:
            # Send email with PDF attachment
            success = send_donation_certificate_email(
                email=donation.email,
                name=donation.name,
                amount=donation.amount,
                pdf_path=temp_path
            )
            
            if success:
                logger.info("Certificate emailed successfully for donation %s", donation.id)
            else:
                logger.warning("Failed to email certificate for donation %s", donation.id)
            
            return success
        finally:
            # Clean up temporary file
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception as cleanup_error:
                logger.warning("Failed to delete temporary certificate file: %s", str(cleanup_error))
        
    except Exception as e:
        import traceback
        logger.error("Failed to email certificate for donation %s: %s", donation.id, str(e))
        logger.error("Traceback: %s", traceback.format_exc())
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
    
    # Only count confirmed payments (exclude Failed, Abandoned, Pending)
    confirmed_filter = ~Donation.frequency.like('Failed%') & \
                       ~Donation.frequency.like('Abandoned%') & \
                       ~Donation.frequency.like('Pending%')
    total_donations = db.query(func.sum(Donation.amount)).filter(confirmed_filter).scalar() or 0
    total_donors = db.query(Donation.email).filter(confirmed_filter).distinct().count()
    recent_donations = db.query(Donation).filter(confirmed_filter).order_by(Donation.donated_at.desc()).limit(5).all()
    
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
        logger.error("Payment processing is not configured: Stripe API key missing")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing is not configured. Please contact support."
        )
    
    try:
        # Get frontend URL from environment
        frontend_url = os.getenv("FRONTEND_URL", "https://myzakat.org")
        
        # Create Stripe checkout session
        purpose = payment.purpose or "General Donation"
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"{purpose} - {payment.frequency}",
                        "description": f"Donation from {payment.name}",
                    },
                    "unit_amount": int(payment.amount * 100),  # Convert to cents
                },
                "quantity": 1,
            }],
            mode="payment",
            customer_email=payment.email,
            metadata={
                "purpose": purpose,
                "frequency": payment.frequency,
                "donor_name": payment.name,
                "donor_email": payment.email
            },
            success_url=f"{frontend_url}/donation-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/donate",
        )
        
        # No pending record created. The webhook creates the donation
        # when Stripe confirms payment succeeded. If the webhook fails,
        # admins can recover missing donations via the "Sync Stripe" button.

        return PaymentSession(id=checkout_session.id)
        
    except stripe.error.StripeError as e:
        import traceback
        logger.error("Stripe error in create_payment_session: %s", str(e))
        logger.error("Traceback: %s", traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        import traceback
        logger.error("Payment processing error: %s", str(e))
        logger.error("Error type: %s", type(e).__name__)
        logger.error("Traceback: %s", traceback.format_exc())
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
        purpose = subscription.purpose or "General Donation"
        product = stripe.Product.create(
            name=f"{purpose} - {subscription.interval.title()}ly Donation",
            description=f"Recurring {purpose} donation from {subscription.name}",
            metadata={
                "purpose": purpose,
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
                "purpose": purpose,
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
                    "purpose": purpose,
                    "donor_name": subscription.name,
                    "payment_day": str(subscription.payment_day),
                    "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
                }
            },
            success_url=f"{frontend_url}/donation-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/donate",
            metadata={
                "type": "subscription",
                "purpose": purpose,
                "donor_name": subscription.name,
                "payment_day": str(subscription.payment_day),
                "payment_month": str(subscription.payment_month) if subscription.payment_month else "",
            }
        )
        
        # No pending records created. The webhook creates both the subscription
        # and donation records when Stripe confirms the payment succeeded.
        # Abandoned checkouts never clutter the admin console.


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
async def cancel_subscription(request: dict, db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
    """Cancel a subscription (admin only)"""
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
                except Exception as e:
                    logger.warning("Failed to update pending subscription %s: %s", sub.id, e)
                    continue
            else:
                # Update status from existing subscription ID
                try:
                    stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
                    if sub.status != stripe_sub.status:
                        sub.status = stripe_sub.status
                        sub.updated_at = datetime.utcnow()
                        updated_count += 1
                except Exception as e:
                    logger.warning("Failed to retrieve subscription %s: %s", sub.stripe_subscription_id, e)
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
                            logger.error("Error syncing subscription %s: %s", session.subscription, str(sub_error))
                            continue
        
        db.commit()
        return {"status": "success", "synced": synced_count}
        
    except Exception as e:
        db.rollback()
        # Log the full error for debugging
        import traceback
        logger.error("Stripe sync error: %s", str(e))
        logger.error("Traceback: %s", traceback.format_exc())
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}"
        )



@router.get("/debug-subscriptions")
async def debug_subscriptions(db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
    """Debug endpoint to check subscription records (admin only, development only)"""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debug endpoint disabled in production"
        )

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
    """Handle Stripe webhooks for payment confirmation.

    Idempotency: Each event ID is tracked so Stripe retries don't create
    duplicate records. For one-time payments, the pending donation (created
    at session time) is updated — never duplicated. For subscriptions,
    only invoice.payment_succeeded creates a donation record.
    """
    global _processed_events

    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

        if not webhook_secret:
            logger.error("Webhook secret not configured")
            return JSONResponse(status_code=500, content={"status": "webhook secret not configured"})

        # Verify webhook signature
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except ValueError as e:
            logger.error("Invalid webhook payload: %s", str(e))
            return JSONResponse(status_code=400, content={"status": "invalid payload"})
        except stripe.error.SignatureVerificationError as e:
            logger.error("Invalid webhook signature: %s", str(e))
            return JSONResponse(status_code=400, content={"status": "invalid signature"})

        event_id = event.get("id", "")
        event_type = event["type"]

        # ── Idempotency: skip already-processed events ──
        if event_id in _processed_events:
            logger.info("Skipping duplicate webhook event: %s (%s)", event_id, event_type)
            return {"status": "already_processed"}

        _processed_events.add(event_id)
        if len(_processed_events) > _MAX_PROCESSED_EVENTS:
            _processed_events = set(list(_processed_events)[_MAX_PROCESSED_EVENTS // 2:])

        logger.info("Processing webhook: %s (event %s)", event_type, event_id)

        # ── checkout.session.completed ──
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            session_mode = session.get("mode", "payment")
            session_id = session.get("id")

            if session_mode == "payment":
                customer_email = session.get("customer_email", "")
                amount = session.get("amount_total", 0) / 100.0
                metadata = session.get("metadata") or {}
                donor_name = metadata.get("donor_name", "")
                if not donor_name:
                    details = session.get("customer_details") or {}
                    donor_name = details.get("name", "")
                frequency = metadata.get("frequency", "One-Time")

                try:
                    existing = db.query(Donation).filter(
                        Donation.stripe_session_id == session_id
                    ).first()

                    if existing:
                        existing.name = donor_name or existing.name
                        existing.email = customer_email or existing.email
                        existing.amount = amount
                        existing.frequency = frequency
                        existing.certificate_filename = "available"
                        if not existing.donated_at:
                            existing.donated_at = datetime.utcnow()
                        db.commit()
                        db.refresh(existing)
                        logger.info("Donation %s confirmed (updated pending) — sending certificate to %s", existing.id, existing.email)
                        _send_certificate_safe(existing)
                    else:
                        new_donation = Donation(
                            name=donor_name or "Anonymous",
                            email=customer_email,
                            amount=amount,
                            frequency=frequency,
                            stripe_session_id=session_id,
                            donated_at=datetime.utcnow(),
                            certificate_filename="available",
                        )
                        db.add(new_donation)
                        db.commit()
                        db.refresh(new_donation)
                        logger.info("Donation %s created (no pending found)", new_donation.id)
                        _send_certificate_safe(new_donation)

                except Exception as e:
                    logger.error("Error processing payment webhook: %s", e)
                    db.rollback()
                    raise

            elif session_mode == "subscription":
                try:
                    sub = db.query(DonationSubscription).filter(
                        DonationSubscription.stripe_session_id == session_id
                    ).first()
                    if sub:
                        sub.status = "checkout_completed"
                        db.commit()
                except Exception as e:
                    logger.error("Error updating subscription checkout: %s", e)
                    db.rollback()

        # ── customer.subscription.created — activate subscription, NO donation ──
        elif event_type == "customer.subscription.created":
            subscription = event["data"]["object"]
            subscription_id = subscription.get("id")
            customer_id = subscription.get("customer")

            try:
                customer = stripe.Customer.retrieve(customer_id)
                metadata = subscription.get("metadata") or customer.get("metadata") or {}
                amount = subscription["items"]["data"][0]["price"]["unit_amount"] / 100.0
                interval = subscription["items"]["data"][0]["price"]["recurring"]["interval"]

                existing_sub = db.query(DonationSubscription).filter(
                    DonationSubscription.email == customer.email,
                    DonationSubscription.status.in_(["pending", "checkout_completed"])
                ).first()

                if existing_sub:
                    existing_sub.stripe_subscription_id = subscription_id
                    existing_sub.stripe_customer_id = customer_id
                    existing_sub.status = "active"
                else:
                    db.add(DonationSubscription(
                        stripe_subscription_id=subscription_id,
                        stripe_customer_id=customer_id,
                        name=metadata.get("donor_name", customer.name or ""),
                        email=customer.email,
                        amount=amount,
                        purpose=metadata.get("purpose", "General Donation"),
                        interval=interval,
                        payment_day=1,
                        status="active",
                    ))

                # NOTE: No donation record here. invoice.payment_succeeded
                # creates exactly one donation per actual charge.
                db.commit()
                logger.info("Subscription %s activated for %s", subscription_id, customer.email)

            except Exception as e:
                logger.error("Error processing subscription created: %s", e)
                db.rollback()

        # ── invoice.payment_succeeded — ONE donation per actual charge ──
        elif event_type == "invoice.payment_succeeded":
            invoice = event["data"]["object"]
            invoice_id = invoice.get("id", "")
            subscription_id = invoice.get("subscription")

            if subscription_id:
                amount_paid = invoice.get("amount_paid", 0) / 100.0
                billing_reason = invoice.get("billing_reason", "")

                # Guard: check if we already recorded a donation for this invoice
                existing_invoice_donation = db.query(Donation).filter(
                    Donation.stripe_session_id == invoice_id
                ).first()
                if existing_invoice_donation:
                    logger.info("Invoice %s already recorded, skipping", invoice_id)
                else:
                    db_sub = db.query(DonationSubscription).filter(
                        DonationSubscription.stripe_subscription_id == subscription_id
                    ).first()

                    if db_sub:
                        try:
                            donation = Donation(
                                name=db_sub.name,
                                email=db_sub.email,
                                amount=amount_paid,
                                frequency=f"Recurring {db_sub.interval}ly",
                                stripe_session_id=invoice_id,
                                donated_at=datetime.utcnow(),
                                certificate_filename="available",
                            )
                            db.add(donation)

                            db_sub.next_payment_date = calculate_next_payment_date(
                                db_sub.payment_day, db_sub.payment_month, db_sub.interval
                            )
                            db_sub.updated_at = datetime.utcnow()
                            db.commit()
                            db.refresh(donation)
                            logger.info("Subscription payment recorded: donation %s ($%s)", donation.id, amount_paid)
                            _send_certificate_safe(donation)
                        except Exception as e:
                            logger.error("Error processing subscription payment: %s", e)
                            db.rollback()

        # ── invoice.payment_failed ──
        elif event_type == "invoice.payment_failed":
            subscription_id = event["data"]["object"].get("subscription")
            if subscription_id:
                db_sub = db.query(DonationSubscription).filter(
                    DonationSubscription.stripe_subscription_id == subscription_id
                ).first()
                if db_sub:
                    db_sub.status = "past_due"
                    db_sub.updated_at = datetime.utcnow()
                    db.commit()

        # ── customer.subscription.deleted ──
        elif event_type == "customer.subscription.deleted":
            subscription_id = event["data"]["object"].get("id")
            if subscription_id:
                db_sub = db.query(DonationSubscription).filter(
                    DonationSubscription.stripe_subscription_id == subscription_id
                ).first()
                if db_sub:
                    db_sub.status = "canceled"
                    db_sub.updated_at = datetime.utcnow()
                    db.commit()

        # ── checkout.session.expired — user abandoned checkout ──
        elif event_type == "checkout.session.expired":
            session = event["data"]["object"]
            session_id = session.get("id")
            amount = session.get("amount_total", 0) / 100.0
            customer_email = session.get("customer_email", "")
            details = session.get("customer_details") or {}
            if not customer_email:
                customer_email = details.get("email", "")
            donor_name = details.get("name", "") or (session.get("metadata") or {}).get("donor_name", "")

            if customer_email and amount > 0:
                # Avoid duplicates if the same session already recorded
                exists = db.query(Donation).filter(
                    Donation.stripe_session_id == session_id
                ).first()
                if not exists:
                    try:
                        db.add(Donation(
                            name=donor_name or "Anonymous",
                            email=customer_email,
                            amount=amount,
                            frequency="Abandoned",
                            stripe_session_id=session_id,
                            donated_at=datetime.utcnow(),
                        ))
                        db.commit()
                        logger.info("Recorded abandoned checkout for %s ($%s)", customer_email, amount)
                    except Exception as e:
                        logger.error("Error recording abandoned checkout: %s", e)
                        db.rollback()

        # ── charge.failed — payment was declined ──
        elif event_type == "charge.failed":
            charge = event["data"]["object"]
            charge_id = charge.get("id", "")
            amount = charge.get("amount", 0) / 100.0
            customer_email = charge.get("billing_details", {}).get("email") or charge.get("receipt_email", "")
            donor_name = charge.get("billing_details", {}).get("name", "") or "Anonymous"
            failure_code = charge.get("failure_code") or charge.get("outcome", {}).get("reason") or "declined"
            failure_message = charge.get("failure_message") or charge.get("outcome", {}).get("seller_message", "")

            if customer_email and amount > 0:
                exists = db.query(Donation).filter(
                    Donation.stripe_session_id == charge_id
                ).first()
                if not exists:
                    try:
                        reason = failure_code[:40]  # keep frequency column short
                        db.add(Donation(
                            name=donor_name,
                            email=customer_email,
                            amount=amount,
                            frequency=f"Failed - {reason}",
                            stripe_session_id=charge_id,
                            donated_at=datetime.utcnow(),
                        ))
                        db.commit()
                        logger.info("Recorded failed charge for %s ($%s): %s — %s", customer_email, amount, failure_code, failure_message)
                    except Exception as e:
                        logger.error("Error recording failed charge: %s", e)
                        db.rollback()

        logger.info("Webhook processed successfully: %s", event_type)
        return {"status": "success"}

    except stripe.error.SignatureVerificationError as e:
        logger.error("Webhook signature verification failed: %s", str(e))
        return JSONResponse(status_code=400, content={"status": "signature verification failed"})
    except Exception as e:
        logger.error("Webhook processing error: %s", str(e))
        return JSONResponse(status_code=500, content={"status": "webhook error"})


def _send_certificate_safe(donation: Donation):
    """Send certificate email without failing the webhook if it errors."""
    try:
        logger.info("Auto-sending certificate for donation %s to %s (amount: $%s)", donation.id, donation.email, donation.amount)
        if email_certificate(donation):
            logger.info("Certificate auto-emailed to %s for donation %s", donation.email, donation.id)
        else:
            logger.error("Certificate auto-email FAILED for donation %s (email_certificate returned False)", donation.id)
    except Exception as e:
        import traceback
        logger.error("Certificate auto-email ERROR for donation %s: %s", donation.id, e)
        logger.error("Traceback: %s", traceback.format_exc())
