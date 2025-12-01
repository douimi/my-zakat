from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database import get_db
from models import ContactSubmission
from schemas import ContactCreate, ContactResponse
from auth_utils import get_current_admin
from email_service import send_contact_reply_email

router = APIRouter()


@router.post("/", response_model=ContactResponse)
async def create_contact_submission(contact: ContactCreate, db: Session = Depends(get_db)):
    db_contact = ContactSubmission(**contact.dict())
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.get("/", response_model=List[ContactResponse])
async def get_contact_submissions(
    skip: int = 0,
    limit: int = 100,
    resolved: bool = None,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    query = db.query(ContactSubmission)
    if resolved is not None:
        query = query.filter(ContactSubmission.resolved == resolved)
    
    contacts = query.offset(skip).limit(limit).all()
    return contacts


@router.patch("/{contact_id}/resolve")
async def resolve_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    contact = db.query(ContactSubmission).filter(ContactSubmission.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact submission not found")
    
    contact.resolved = True
    db.commit()
    return {"message": "Contact submission resolved"}


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    contact = db.query(ContactSubmission).filter(ContactSubmission.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact submission not found")
    
    db.delete(contact)
    db.commit()
    return {"message": "Contact submission deleted"}


class ContactReply(BaseModel):
    reply_message: str


@router.post("/{contact_id}/reply")
async def reply_to_contact(
    contact_id: int,
    reply: ContactReply,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """
    Send a reply email to a contact submission
    """
    contact = db.query(ContactSubmission).filter(ContactSubmission.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact submission not found")
    
    if not reply.reply_message or not reply.reply_message.strip():
        raise HTTPException(status_code=400, detail="Reply message cannot be empty")
    
    # Send reply email
    try:
        success = send_contact_reply_email(
            recipient_email=contact.email,
            recipient_name=contact.name,
            original_message=contact.message,
            reply_message=reply.reply_message.strip()
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send reply email")
        
        # Optionally mark as resolved after sending reply
        # contact.resolved = True
        # db.commit()
        
        return {"message": "Reply email sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending reply email: {str(e)}")
