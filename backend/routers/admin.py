from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
import aiofiles
import os
from datetime import datetime
from s3_service import upload_file, generate_object_key, get_file_url
from media_processing import compress_image, compress_video, generate_video_thumbnail, should_compress_image, should_compress_video

from database import get_db
from models import ContactSubmission, Donation, Event, Volunteer, Story, Testimonial, Subscription, Setting, User
from schemas import UserResponse, PasswordChange
from auth_utils import get_current_admin, verify_password, get_password_hash

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
        category = "videos"
        max_size = 50 * 1024 * 1024  # 50MB
    elif type.startswith('program_video'):
        if not file.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        category = "videos"
        max_size = 100 * 1024 * 1024  # 100MB
    elif type.startswith('program_image'):
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        category = "images"
        max_size = 5 * 1024 * 1024  # 5MB
    elif type.startswith('gallery_item'):
        # Gallery items can be either images or videos
        if not (file.content_type.startswith('image/') or file.content_type.startswith('video/')):
            raise HTTPException(status_code=400, detail="File must be an image or video")
        if file.content_type.startswith('video/'):
            category = "videos"
            max_size = 100 * 1024 * 1024  # 100MB
        else:
            category = "images"
            max_size = 5 * 1024 * 1024  # 5MB
    else:
        raise HTTPException(status_code=400, detail="Invalid media type")
    
    # Read file content
    file_content = await file.read()
    original_size = len(file_content)
    
    if original_size > max_size:
        raise HTTPException(status_code=400, detail="File size too large")
    
    # Compress media before uploading
    is_image = file.content_type.startswith('image/')
    is_video = file.content_type.startswith('video/')
    
    if is_image and should_compress_image(file.content_type):
        print(f"🗜️  Compressing image before upload...")
        file_content = compress_image(file_content)
    elif is_video and should_compress_video(file.content_type):
        print(f"🗜️  Compressing video before upload...")
        file_content = compress_video(file_content)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ''
    filename = f"{type}_{timestamp}{file_extension}"
    
    # Upload to S3 - ALWAYS use S3, never fall back to local storage
    try:
        object_key = generate_object_key(category, filename)
        print(f"📤 Uploading to S3: {object_key} (size: {len(file_content)} bytes)")
        s3_url = upload_file(
            file_content=file_content,
            object_key=object_key,
            content_type=file.content_type,
            metadata={"type": type, "original_filename": file.filename or ""}
        )
        print(f"✅ Successfully uploaded to S3: {s3_url}")
        
        # Generate and upload thumbnail for videos
        thumbnail_url = None
        if is_video:
            print(f"🖼️  Generating video thumbnail...")
            thumbnail_data = generate_video_thumbnail(file_content)
            if thumbnail_data:
                thumbnail_filename = f"{type}_{timestamp}_thumb.jpg"
                thumbnail_key = generate_object_key("images", thumbnail_filename)
                thumbnail_url = upload_file(
                    file_content=thumbnail_data,
                    object_key=thumbnail_key,
                    content_type="image/jpeg",
                    metadata={"original_filename": filename, "type": "video_thumbnail", "parent_video": object_key}
                )
                print(f"✅ Video thumbnail uploaded: {thumbnail_url}")
        
        return {
            "filename": filename,
            "url": s3_url,
            "path": s3_url,  # Keep for backward compatibility
            "type": type,
            "content_type": file.content_type,
            "thumbnail_url": thumbnail_url  # Include thumbnail URL if generated
        }
    except Exception as e:
        # Log the error with full details
        import traceback
        error_msg = f"Failed to upload to S3: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Error type: {type(e).__name__}")
        print(traceback.format_exc())
        
        # ALWAYS fail - never fall back to local storage
        # This ensures files are stored in S3, not in container filesystem
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to S3. Please check S3 configuration. Error: {str(e)}"
        )


# User Management Endpoints
@router.get("/users")
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Get all registered users"""
    users = db.query(User).offset(skip).limit(limit).all()
    
    return [{
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "created_at": user.created_at
    } for user in users]


@router.get("/users/{user_id}")
async def get_user_details(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Get detailed information about a specific user"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's donation history
    donations = db.query(Donation).filter(Donation.email == user.email).all()
    
    # Get user's subscriptions
    from models import DonationSubscription
    subscriptions = db.query(DonationSubscription).filter(
        DonationSubscription.email == user.email
    ).all()
    
    # Calculate stats
    total_donated = sum(d.amount for d in donations)
    
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "created_at": user.created_at
        },
        "donations": [{
            "id": d.id,
            "amount": d.amount,
            "frequency": d.frequency,
            "donated_at": d.donated_at
        } for d in donations],
        "subscriptions": [{
            "id": s.id,
            "stripe_subscription_id": s.stripe_subscription_id,
            "amount": s.amount,
            "purpose": s.purpose,
            "interval": s.interval,
            "status": s.status,
            "created_at": s.created_at
        } for s in subscriptions],
        "stats": {
            "total_donated": total_donated,
            "donation_count": len(donations),
            "active_subscriptions": len([s for s in subscriptions if s.status == "active"])
        }
    }


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Toggle user active status"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent admins from deactivating themselves
    if current_admin.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    
    user.is_active = not user.is_active
    user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": f"User {'activated' if user.is_active else 'deactivated'} successfully", "is_active": user.is_active}


@router.patch("/users/{user_id}/toggle-admin")
async def toggle_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Toggle user admin status"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent admins from modifying their own admin privileges
    if current_admin.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot modify your own admin privileges")
    
    user.is_admin = not user.is_admin
    user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": f"User admin status {'granted' if user.is_admin else 'revoked'} successfully", "is_admin": user.is_admin}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete a user account"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent admins from deleting themselves
    if current_admin.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Change the current admin user's password"""
    # Verify the old password
    if not verify_password(password_data.old_password, current_admin.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Hash the new password
    hashed_password = get_password_hash(password_data.new_password)
    
    # Update the password
    current_admin.password = hashed_password
    current_admin.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Password changed successfully"}
