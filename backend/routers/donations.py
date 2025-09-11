from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import stripe
import os
from dotenv import load_dotenv

from database import get_db
from models import Donation
from schemas import DonationCreate, DonationResponse, PaymentCreate, PaymentSession, ZakatCalculation, ZakatResult
from auth_utils import get_current_admin

load_dotenv()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

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
    
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
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
            mode="payment",
            customer_email=payment.email,
            metadata={
                "purpose": payment.purpose,
                "frequency": payment.frequency,
                "donor_name": payment.name
            },
            success_url="http://localhost:3000/donation-success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url="http://localhost:3000/donate",
        )
        return PaymentSession(id=session.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/stripe-webhook")
async def stripe_webhook(request, db: Session = Depends(get_db)):
    # This would handle Stripe webhooks for payment confirmation
    # Implementation would depend on your webhook configuration
    pass
