from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
try:
    import stripe
    # Try to access the Session class directly
    try:
        from stripe.checkout import Session as StripeSession
    except ImportError:
        StripeSession = None
except ImportError as e:
    stripe = None
    StripeSession = None
import os
from dotenv import load_dotenv

from database import get_db
from models import Donation
from schemas import DonationCreate, DonationResponse, PaymentCreate, PaymentSession, ZakatCalculation, ZakatResult
from auth_utils import get_current_admin

load_dotenv()
stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")

# Configure Stripe API key
if stripe is not None and stripe_secret_key and stripe_secret_key.startswith(('sk_test_', 'sk_live_')):
    stripe.api_key = stripe_secret_key

router = APIRouter()


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
async def create_payment_session(payment: PaymentCreate):
    if not payment.amount or payment.amount < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid amount"
        )
    
    if stripe is None or not stripe.api_key or not stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing is not configured. Please contact support."
        )
    
    try:
        # Get frontend URL from environment or use default
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        
        # Create session parameters
        session_params = {
            "payment_method_types": ["card"],
            "line_items": [{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"{payment.purpose} ({payment.frequency})",
                        "description": f"Donor: {payment.name}, Email: {payment.email}",
                    },
                    "unit_amount": int(payment.amount * 100),
                },
                "quantity": 1,
            }],
            "mode": "payment",
            "customer_email": payment.email,
            "metadata": {
                "purpose": payment.purpose,
                "frequency": payment.frequency,
                "donor_name": payment.name
            },
            "success_url": f"{frontend_url}/donation-success?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{frontend_url}/donate",
        }

        # Create Stripe checkout session
        if StripeSession:
            session = StripeSession.create(**session_params)
        else:
            session = stripe.checkout.Session.create(**session_params)
        
        return PaymentSession(id=session.id)
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing error"
        )


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
        
        # Handle successful payment
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            
            # Extract payment details
            customer_email = session.get("customer_email", "")
            amount = session.get("amount_total", 0) / 100.0  # Convert from cents
            
            # Get donor name from metadata or customer details
            donor_name = ""
            if "metadata" in session and session["metadata"]:
                donor_name = session["metadata"].get("donor_name", "")
            elif "customer_details" in session and session["customer_details"]:
                donor_name = session["customer_details"].get("name", "")
            
            purpose = session.get("metadata", {}).get("purpose", "General Donation")
            frequency = session.get("metadata", {}).get("frequency", "One-Time")
            
            # Save donation to database
            try:
                donation = Donation(
                    name=donor_name,
                    email=customer_email,
                    amount=amount,
                    frequency=frequency
                )
                db.add(donation)
                db.commit()
                # TODO: Send confirmation email
                # This would require email configuration
                
            except Exception as db_error:
                db.rollback()
                return {"status": "database error"}, 500
        
        return {"status": "success"}
        
    except stripe.error.SignatureVerificationError:
        return {"status": "signature verification failed"}, 400
    except Exception:
        return {"status": "webhook error"}, 500
