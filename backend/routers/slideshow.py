from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime
import os
import traceback

from database import get_db
from models import SlideshowSlide
from schemas import SlideshowSlideCreate, SlideshowSlideUpdate, SlideshowSlideResponse
from auth_utils import get_current_admin
from s3_service import upload_file, delete_file, generate_object_key, extract_object_key_from_url

router = APIRouter()

UPLOAD_DIR = "uploads/media/images"


@router.get("/", response_model=List[SlideshowSlideResponse])
async def get_slideshow_slides(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all slideshow slides, optionally filtered to active only"""
    try:
        query = db.query(SlideshowSlide)
        if active_only:
            query = query.filter(SlideshowSlide.is_active == True)
        # Handle NULL display_order values by using COALESCE to default to a large number
        # This puts NULL values at the end
        slides = query.order_by(
            func.coalesce(SlideshowSlide.display_order, 999999),
            SlideshowSlide.id
        ).all()
        
        # Manually validate and serialize to catch any issues
        result = []
        for slide in slides:
            try:
                # Create a dict with defaults for None values to avoid validation errors
                slide_dict = {
                    'id': slide.id,
                    'title': slide.title,
                    'description': slide.description,
                    'image_filename': slide.image_filename,
                    'image_url': slide.image_url,
                    'cta_text': slide.cta_text,
                    'cta_url': slide.cta_url,
                    'display_order': slide.display_order if slide.display_order is not None else 0,
                    'is_active': slide.is_active if slide.is_active is not None else True,
                    'created_at': slide.created_at if slide.created_at is not None else datetime.utcnow(),
                    'updated_at': slide.updated_at if slide.updated_at is not None else datetime.utcnow(),
                }
                # Validate using Pydantic model
                validated_slide = SlideshowSlideResponse.model_validate(slide_dict)
                result.append(validated_slide)
            except Exception as slide_error:
                error_trace = traceback.format_exc()
                print(f"Error serializing slide {slide.id}: {str(slide_error)}")
                print(f"Slide data: id={slide.id}, title={slide.title}, display_order={slide.display_order}, created_at={slide.created_at}, updated_at={slide.updated_at}")
                print(f"Traceback: {error_trace}")
                # Skip invalid slides or raise error
                raise HTTPException(
                    status_code=500, 
                    detail=f"Error serializing slide {slide.id}: {str(slide_error)}"
                )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging
        error_trace = traceback.format_exc()
        print(f"Error in get_slideshow_slides: {str(e)}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error fetching slideshow slides: {str(e)}")


@router.get("/{slide_id}", response_model=SlideshowSlideResponse)
async def get_slideshow_slide(slide_id: int, db: Session = Depends(get_db)):
    """Get a specific slideshow slide"""
    slide = db.query(SlideshowSlide).filter(SlideshowSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    return slide


@router.post("/", response_model=SlideshowSlideResponse)
async def create_slideshow_slide(
    slide: SlideshowSlideCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Create a new slideshow slide"""
    try:
        # Use model_dump() for Pydantic v2 compatibility
        slide_data = slide.model_dump() if hasattr(slide, 'model_dump') else slide.dict()
        db_slide = SlideshowSlide(**slide_data)
        db.add(db_slide)
        db.commit()
        db.refresh(db_slide)
        return db_slide
    except Exception as e:
        db.rollback()
        error_trace = traceback.format_exc()
        print(f"Error in create_slideshow_slide: {str(e)}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error creating slideshow slide: {str(e)}")


@router.put("/{slide_id}", response_model=SlideshowSlideResponse)
async def update_slideshow_slide(
    slide_id: int,
    slide_update: SlideshowSlideUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update a slideshow slide"""
    slide = db.query(SlideshowSlide).filter(SlideshowSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    
    # Use model_dump() for Pydantic v2 compatibility
    update_data = slide_update.model_dump(exclude_unset=True) if hasattr(slide_update, 'model_dump') else slide_update.dict(exclude_unset=True)
    
    # Handle image file deletion when image fields are updated
    # Delete old image_filename if being cleared or changed
    if 'image_filename' in update_data:
        old_image_filename = slide.image_filename
        new_image_filename = update_data['image_filename']
        if old_image_filename and (not new_image_filename or new_image_filename != old_image_filename):
            old_path = os.path.join(UPLOAD_DIR, old_image_filename)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Warning: Could not delete old image_filename file {old_path}: {e}")
    
    # Delete old image_url if being cleared or changed from filename to URL
    if 'image_url' in update_data:
        old_image_url = slide.image_url
        new_image_url = update_data['image_url']
        # If old image_url was a filename (not URL) and we're changing it
        if old_image_url and not old_image_url.startswith(('http://', 'https://')):
            if not new_image_url or new_image_url.startswith(('http://', 'https://')) or new_image_url != old_image_url:
                old_path = os.path.join(UPLOAD_DIR, old_image_url)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Warning: Could not delete old image_url file {old_path}: {e}")
    
    for field, value in update_data.items():
        setattr(slide, field, value)
    
    db.commit()
    db.refresh(slide)
    return slide


@router.delete("/{slide_id}")
async def delete_slideshow_slide(
    slide_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete a slideshow slide"""
    slide = db.query(SlideshowSlide).filter(SlideshowSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    
    # Delete the image file if it exists (check both image_filename and image_url)
    if slide.image_filename:
        image_path = os.path.join(UPLOAD_DIR, slide.image_filename)
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                print(f"Error deleting image file: {e}")
    
    # Also check image_url if it's a filename (not a URL)
    if slide.image_url and not slide.image_url.startswith(('http://', 'https://')):
        image_path = os.path.join(UPLOAD_DIR, slide.image_url)
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                print(f"Error deleting image file from image_url: {e}")
    
    db.delete(slide)
    db.commit()
    return {"message": "Slide deleted successfully"}


@router.post("/{slide_id}/upload-image", response_model=SlideshowSlideResponse)
async def upload_slideshow_image(
    slide_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Upload an image for a slideshow slide"""
    slide = db.query(SlideshowSlide).filter(SlideshowSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create upload directory if it doesn't exist
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1] if file.filename else '.jpg'
    filename = f"slideshow_{slide_id}_{int(os.urandom(4).hex(), 16)}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Delete old image if it exists (check both image_filename and image_url)
    if slide.image_filename:
        if slide.image_filename.startswith('http://') or slide.image_filename.startswith('https://'):
            object_key = extract_object_key_from_url(slide.image_filename)
            if object_key:
                delete_file(object_key)
        else:
            old_path = os.path.join(UPLOAD_DIR, slide.image_filename)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Error deleting old image: {e}")
    
    # Also check image_url if it's a filename (not a URL)
    if slide.image_url and not slide.image_url.startswith(('http://', 'https://')):
        old_path = os.path.join(UPLOAD_DIR, slide.image_url)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception as e:
                print(f"Error deleting old image from image_url: {e}")
    
    # Read file content
    content_bytes = await file.read()
    
    # Upload to S3
    try:
        object_key = generate_object_key("images", filename)
        s3_url = upload_file(
            file_content=content_bytes,
            object_key=object_key,
            content_type=file.content_type,
            metadata={"original_filename": file.filename or "", "type": "slideshow_image", "slide_id": str(slide_id)}
        )
        slide.image_filename = s3_url
    except Exception as e:
        # ALWAYS fail - never fall back to local storage
        import traceback
        print(f"❌ Failed to upload slideshow image to S3: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image to S3. Error: {str(e)}"
        )
    db.commit()
    db.refresh(slide)
    
    return slide

