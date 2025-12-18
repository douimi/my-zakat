from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from pathlib import Path

from database import get_db
from models import ProgramCategory
from schemas import ProgramCategoryCreate, ProgramCategoryUpdate, ProgramCategoryResponse
from auth_utils import get_current_admin

router = APIRouter()

# Ensure upload directory exists
UPLOAD_DIR = Path("uploads/program_categories")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=List[ProgramCategoryResponse])
async def get_categories(
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get all program categories, optionally filtered to active only"""
    query = db.query(ProgramCategory)
    if active_only:
        query = query.filter(ProgramCategory.is_active == True)
    categories = query.order_by(ProgramCategory.display_order, ProgramCategory.name).all()
    return categories


@router.get("/{category_id}", response_model=ProgramCategoryResponse)
async def get_category(category_id: int, db: Session = Depends(get_db)):
    """Get a specific program category by ID"""
    category = db.query(ProgramCategory).filter(ProgramCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.get("/slug/{slug}", response_model=ProgramCategoryResponse)
async def get_category_by_slug(slug: str, db: Session = Depends(get_db)):
    """Get a specific program category by slug"""
    category = db.query(ProgramCategory).filter(ProgramCategory.slug == slug).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/", response_model=ProgramCategoryResponse)
async def create_category(
    category: ProgramCategoryCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Create a new program category"""
    # Check if name or slug already exists
    existing_name = db.query(ProgramCategory).filter(ProgramCategory.name == category.name).first()
    if existing_name:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    existing_slug = db.query(ProgramCategory).filter(ProgramCategory.slug == category.slug).first()
    if existing_slug:
        raise HTTPException(status_code=400, detail="Category with this slug already exists")
    
    db_category = ProgramCategory(**category.dict())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


@router.put("/{category_id}", response_model=ProgramCategoryResponse)
async def update_category(
    category_id: int,
    category_update: ProgramCategoryUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update a program category"""
    category = db.query(ProgramCategory).filter(ProgramCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if name or slug conflicts with other categories
    update_data = category_update.dict(exclude_unset=True)
    if 'name' in update_data:
        existing = db.query(ProgramCategory).filter(
            ProgramCategory.name == update_data['name'],
            ProgramCategory.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    if 'slug' in update_data:
        existing = db.query(ProgramCategory).filter(
            ProgramCategory.slug == update_data['slug'],
            ProgramCategory.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category with this slug already exists")
    
    # Handle media file deletion when fields are updated
    # Delete old video if video_filename is being cleared or changed
    if 'video_filename' in update_data:
        old_video = category.video_filename
        new_video = update_data['video_filename']
        # If clearing video or changing to a new one, delete old file
        if old_video and (not new_video or new_video != old_video):
            if not old_video.startswith(('http://', 'https://')):  # Only delete if it's a filename
                old_path = UPLOAD_DIR / old_video
                if old_path.exists():
                    try:
                        old_path.unlink()
                    except Exception as e:
                        print(f"Warning: Could not delete old video file {old_path}: {e}")
    
    # Delete old image if image_url is being cleared or changed from filename to URL
    if 'image_url' in update_data:
        old_image = category.image_url
        new_image = update_data['image_url']
        # If old image was a filename (not URL) and we're changing it
        if old_image and not old_image.startswith(('http://', 'https://')):
            if not new_image or new_image.startswith(('http://', 'https://')) or new_image != old_image:
                # Old image was a filename, delete it
                old_path = Path("uploads/program_categories") / old_image
                if old_path.exists():
                    try:
                        old_path.unlink()
                    except Exception as e:
                        print(f"Warning: Could not delete old image file {old_path}: {e}")
    
    # Update fields
    for field, value in update_data.items():
        setattr(category, field, value)
    
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete a program category"""
    category = db.query(ProgramCategory).filter(ProgramCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Delete associated video file if exists
    if category.video_filename and not category.video_filename.startswith(('http://', 'https://')):
        video_path = UPLOAD_DIR / category.video_filename
        if video_path.exists():
            try:
                video_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete video file {video_path}: {e}")
    
    # Delete associated image file if exists and is a filename (not URL)
    if category.image_url and not category.image_url.startswith(('http://', 'https://')):
        image_path = Path("uploads/program_categories") / category.image_url
        if image_path.exists():
            try:
                image_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete image file {image_path}: {e}")
    
    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}


@router.post("/{category_id}/upload-video", response_model=ProgramCategoryResponse)
async def upload_category_video(
    category_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Upload a video for a program category"""
    category = db.query(ProgramCategory).filter(ProgramCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    # Generate filename
    file_ext = Path(file.filename).suffix
    filename = f"category_{category_id}_{category.slug}{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Delete old video if exists
    if category.video_filename:
        old_path = UPLOAD_DIR / category.video_filename
        if old_path.exists():
            try:
                old_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete old video {old_path}: {e}")
    
    # Save new video
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        category.video_filename = filename
        db.commit()
        db.refresh(category)
        return category
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")

