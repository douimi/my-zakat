from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database import get_db
from models import Subscription
from schemas import SubscriptionCreate, SubscriptionResponse
from auth_utils import get_current_admin

router = APIRouter()


class NewsletterRequest(BaseModel):
    subject: str
    body: str


@router.post("/", response_model=SubscriptionResponse)
async def create_subscription(subscription: SubscriptionCreate, db: Session = Depends(get_db)):
    # Check if email already exists
    existing = db.query(Subscription).filter(Subscription.email == subscription.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already subscribed")
    
    db_subscription = Subscription(**subscription.dict())
    db.add(db_subscription)
    db.commit()
    db.refresh(db_subscription)
    return db_subscription


@router.get("/", response_model=List[SubscriptionResponse])
async def get_subscriptions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    subscriptions = db.query(Subscription).offset(skip).limit(limit).all()
    return subscriptions


@router.delete("/{subscription_id}")
async def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    db.delete(subscription)
    db.commit()
    return {"message": "Subscription deleted"}


@router.post("/send-newsletter")
async def send_newsletter(
    newsletter: NewsletterRequest,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Get all email subscribers
    subscribers = db.query(Subscription).filter(Subscription.wants_email == True).all()
    
    if not subscribers:
        raise HTTPException(status_code=400, detail="No email subscribers found")
    
    # For now, we'll just return success. In a real implementation, 
    # you would integrate with an email service like SendGrid, AWS SES, etc.
    email_count = len(subscribers)
    
    # TODO: Implement actual email sending logic here
    # This is a placeholder that simulates sending emails
    
    return {
        "message": f"Newsletter sent to {email_count} subscribers",
        "sent_count": email_count,
        "subject": newsletter.subject
    }
