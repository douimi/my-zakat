from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime

from database import get_db
from models import Testimonial
from schemas import TestimonialCreate, TestimonialResponse
from auth_utils import get_current_admin
from s3_service import upload_file, delete_file, generate_object_key, extract_object_key_from_url

router = APIRouter()


@router.post("/", response_model=TestimonialResponse)
async def create_testimonial(
    name: str = Form(...),
    country: str = Form(""),
    text: str = Form(...),
    rating: int = Form(5),
    category: str = Form("donor"),
    is_approved: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Handle image - prioritize file upload over URL
    image_value = None
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        content_bytes = await image.read()
        
        # Upload to S3 - ALWAYS use S3, never fall back to local storage
        try:
            object_key = generate_object_key("images", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=image.content_type,
                metadata={"original_filename": image.filename, "type": "testimonial_image"}
            )
            image_value = s3_url
        except Exception as e:
            import traceback
            print(f"❌ Failed to upload testimonial image to S3: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload image to S3. Error: {str(e)}"
            )
    elif image_url and image_url.strip():
        # Use image URL if provided and no file upload
        image_value = image_url.strip()
    
    # Handle video upload if provided
    video_filename = None
    if video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()
        
        # Upload to S3 - ALWAYS use S3, never fall back to local storage
        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "testimonial_video"}
            )
            video_filename = s3_url
        except Exception as e:
            import traceback
            print(f"❌ Failed to upload testimonial video to S3: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload video to S3. Error: {str(e)}"
            )
    
    # Create testimonial in database
    db_testimonial = Testimonial(
        name=name,
        country=country if country else None,
        image=image_value,
        text=text,
        rating=rating,
        video_filename=video_filename,
        category=category,
        is_approved=is_approved
    )
    db.add(db_testimonial)
    db.commit()
    db.refresh(db_testimonial)
    return db_testimonial


@router.get("/", response_model=List[TestimonialResponse])
async def get_testimonials(
    skip: int = 0,
    limit: int = 100,
    approved_only: bool = True,
    db: Session = Depends(get_db)
):
    query = db.query(Testimonial)
    if approved_only:
        query = query.filter(Testimonial.is_approved == True)
    
    testimonials = query.order_by(Testimonial.created_at.desc()).offset(skip).limit(limit).all()
    return testimonials


@router.put("/{testimonial_id}", response_model=TestimonialResponse)
async def update_testimonial(
    testimonial_id: int,
    name: str = Form(...),
    country: str = Form(""),
    text: str = Form(...),
    rating: int = Form(5),
    category: str = Form("donor"),
    is_approved: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    remove_video: Optional[bool] = Form(False),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    
    # Update basic fields
    testimonial.name = name
    testimonial.country = country if country else None
    testimonial.text = text
    testimonial.rating = rating
    testimonial.category = category
    testimonial.is_approved = is_approved
    
    # Handle image - prioritize file upload over URL
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Delete old image if it exists
        old_image = testimonial.image
        if old_image:
            if old_image.startswith('http://') or old_image.startswith('https://'):
                # S3 URL
                object_key = extract_object_key_from_url(old_image)
                if object_key:
                    delete_file(object_key)
            else:
                # Local file
                old_path = os.path.join("uploads/testimonials", old_image)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Warning: Could not delete old image file {old_path}: {e}")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        content_bytes = await image.read()
        
        # Upload to S3
        try:
            object_key = generate_object_key("images", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=image.content_type,
                metadata={"original_filename": image.filename, "type": "testimonial_image"}
            )
            testimonial.image = s3_url
        except Exception as e:
            import traceback
            print(f"❌ Failed to upload testimonial image to S3: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload image to S3. Error: {str(e)}"
            )
    elif image_url is not None:
        # Delete old image file if clearing/changing image
        old_image = testimonial.image
        if old_image:
            if old_image.startswith('http://') or old_image.startswith('https://'):
                object_key = extract_object_key_from_url(old_image)
                if object_key:
                    delete_file(object_key)
            else:
                old_path = os.path.join("uploads/testimonials", old_image)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Warning: Could not delete old image file {old_path}: {e}")
        
        # Update image URL if provided (empty string clears the image)
        testimonial.image = image_url.strip() if image_url.strip() else None
    
    # Handle video removal if requested
    if remove_video:
        if testimonial.video_filename:
            if testimonial.video_filename.startswith('http://') or testimonial.video_filename.startswith('https://'):
                object_key = extract_object_key_from_url(testimonial.video_filename)
                if object_key:
                    delete_file(object_key)
            else:
                old_path = os.path.join("uploads/testimonials", testimonial.video_filename)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Error deleting video: {e}")
        testimonial.video_filename = None
    # Handle video upload if provided
    elif video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Delete old video if it exists
        if testimonial.video_filename:
            if testimonial.video_filename.startswith('http://') or testimonial.video_filename.startswith('https://'):
                object_key = extract_object_key_from_url(testimonial.video_filename)
                if object_key:
                    delete_file(object_key)
            else:
                old_path = os.path.join("uploads/testimonials", testimonial.video_filename)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Error deleting old video: {e}")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()
        
        # Upload to S3
        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "testimonial_video"}
            )
            testimonial.video_filename = s3_url
        except Exception as e:
            import traceback
            print(f"❌ Failed to upload testimonial video to S3: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload video to S3. Error: {str(e)}"
            )
    
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.patch("/{testimonial_id}/approve")
async def approve_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    
    testimonial.is_approved = True
    db.commit()
    return {"message": "Testimonial approved"}


@router.delete("/{testimonial_id}")
async def delete_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    
    # Delete associated video file if exists
    if testimonial.video_filename:
        if testimonial.video_filename.startswith('http://') or testimonial.video_filename.startswith('https://'):
            object_key = extract_object_key_from_url(testimonial.video_filename)
            if object_key:
                delete_file(object_key)
        else:
            video_path = os.path.join("uploads/testimonials", testimonial.video_filename)
            if os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except Exception as e:
                    print(f"Warning: Could not delete video file {video_path}: {e}")
    
    # Delete associated image file if exists
    if testimonial.image:
        if testimonial.image.startswith('http://') or testimonial.image.startswith('https://'):
            object_key = extract_object_key_from_url(testimonial.image)
            if object_key:
                delete_file(object_key)
        else:
            image_path = os.path.join("uploads/testimonials", testimonial.image)
            if os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except Exception as e:
                    print(f"Warning: Could not delete image file {image_path}: {e}")
    
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    
    db.delete(testimonial)
    db.commit()
    return {"message": "Testimonial deleted"}
