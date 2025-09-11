from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import aiofiles
import os
from datetime import datetime

from database import get_db
from models import ContactSubmission, Donation, Event, Volunteer, Story, Testimonial, Subscription, Setting
from auth_utils import get_current_admin

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Donation stats
    total_donations = db.query(func.sum(Donation.amount)).scalar() or 0
    total_donors = db.query(Donation.email).distinct().count()
    top_donor = db.query(Donation).order_by(Donation.amount.desc()).first()
    
    # Contact stats
    total_messages = db.query(ContactSubmission).count()
    pending_contacts = db.query(ContactSubmission).filter(ContactSubmission.resolved == False).count()
    resolved_contacts = db.query(ContactSubmission).filter(ContactSubmission.resolved == True).count()
    
    # Volunteer stats
    total_volunteers = db.query(Volunteer).count()
    volunteers_by_interest = dict(
        db.query(Volunteer.interest, func.count(Volunteer.id))
        .group_by(Volunteer.interest)
        .all()
    )
    
    # Content stats
    total_events = db.query(Event).count()
    total_stories = db.query(Story).count()
    active_stories = db.query(Story).filter(Story.is_active == True).count()
    pending_testimonials = db.query(Testimonial).filter(Testimonial.is_approved == False).count()
    total_subscriptions = db.query(Subscription).count()
    
    return {
        "donations": {
            "total_amount": total_donations,
            "total_donors": total_donors,
            "top_donor": {
                "name": top_donor.name if top_donor else None,
                "amount": top_donor.amount if top_donor else 0
            }
        },
        "contacts": {
            "total_messages": total_messages,
            "pending": pending_contacts,
            "resolved": resolved_contacts
        },
        "volunteers": {
            "total": total_volunteers,
            "by_interest": volunteers_by_interest
        },
        "content": {
            "events": total_events,
            "stories": total_stories,
            "active_stories": active_stories,
            "pending_testimonials": pending_testimonials,
            "subscriptions": total_subscriptions
        }
    }


@router.post("/upload-media")
async def upload_media(
    file: UploadFile = File(...),
    type: str = Form(...),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    # Validate file type based on media type
    if type == 'hero_video':
        if not file.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        upload_dir = "uploads/media/videos"
        max_size = 50 * 1024 * 1024  # 50MB
    elif type.startswith('program_image') or type.startswith('gallery_item'):
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        upload_dir = "uploads/media/images"
        max_size = 5 * 1024 * 1024  # 5MB
    else:
        raise HTTPException(status_code=400, detail="Invalid media type")
    
    # Check file size
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size too large")
    
    # Create uploads directory if it doesn't exist
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ''
    filename = f"{type}_{timestamp}{file_extension}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(file_content)
    
    return {
        "filename": filename,
        "path": f"/uploads/media/{'videos' if type == 'hero_video' else 'images'}/{filename}",
        "type": type
    }
