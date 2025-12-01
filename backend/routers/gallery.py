from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import aiofiles
import os
from datetime import datetime

from database import get_db
from models import GalleryItem
from schemas import GalleryItemCreate, GalleryItemUpdate, GalleryItemResponse
from auth_utils import get_current_admin

router = APIRouter()

# Media upload directories
IMAGE_UPLOAD_DIR = "uploads/media/images"
VIDEO_UPLOAD_DIR = "uploads/media/videos"


@router.get("/", response_model=List[GalleryItemResponse])
async def get_gallery_items(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all gallery items, optionally filtered to active only"""
    query = db.query(GalleryItem)
    if active_only:
        query = query.filter(GalleryItem.is_active == True)
    items = query.order_by(GalleryItem.display_order.asc(), GalleryItem.created_at.asc()).all()
    
    # Ensure datetime fields are set for items that might have None values
    result = []
    for item in items:
        if item.created_at is None:
            item.created_at = datetime.utcnow()
        if item.updated_at is None:
            item.updated_at = datetime.utcnow()
        result.append(item)
    
    return result


@router.get("/{item_id}", response_model=GalleryItemResponse)
async def get_gallery_item(
    item_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific gallery item"""
    item = db.query(GalleryItem).filter(GalleryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Ensure datetime fields are set
    if item.created_at is None:
        item.created_at = datetime.utcnow()
    if item.updated_at is None:
        item.updated_at = datetime.utcnow()
    
    return item


@router.post("/", response_model=GalleryItemResponse)
async def create_gallery_item(
    media_filename: str = Form(...),
    display_order: Optional[int] = Form(0),
    is_active: bool = Form(True),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Create a new gallery item"""
    # If no display_order provided, set it to the max + 1
    if display_order is None:
        max_order = db.query(GalleryItem).order_by(GalleryItem.display_order.desc()).first()
        display_order = (max_order.display_order + 1) if max_order else 0
    
    db_item = GalleryItem(
        media_filename=media_filename,
        display_order=display_order,
        is_active=is_active,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/upload", response_model=GalleryItemResponse)
async def upload_and_create_gallery_item(
    file: UploadFile = File(...),
    display_order: Optional[int] = Form(None),
    is_active: Optional[bool] = Form(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Upload a media file and create a gallery item"""
    # Validate file type
    is_image = file.content_type.startswith('image/')
    is_video = file.content_type.startswith('video/')
    
    if not is_image and not is_video:
        raise HTTPException(status_code=400, detail="File must be an image or video")
    
    # Determine upload directory and max size
    if is_video:
        upload_dir = VIDEO_UPLOAD_DIR
        max_size = 100 * 1024 * 1024  # 100MB
    else:
        upload_dir = IMAGE_UPLOAD_DIR
        max_size = 5 * 1024 * 1024  # 5MB
    
    # Check file size
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail=f"File size too large. Maximum size is {max_size / (1024*1024)}MB")
    
    # Create uploads directory if it doesn't exist
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ''
    filename = f"gallery_{timestamp}{file_extension}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(file_content)
    
    # If no display_order provided, set it to the max + 1
    if display_order is None:
        max_order = db.query(GalleryItem).order_by(GalleryItem.display_order.desc()).first()
        display_order = (max_order.display_order + 1) if max_order else 0
    
    # Default is_active to True if not provided
    if is_active is None:
        is_active = True
    
    # Create gallery item
    db_item = GalleryItem(
        media_filename=filename,
        display_order=display_order,
        is_active=is_active,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=GalleryItemResponse)
async def update_gallery_item(
    item_id: int,
    item_update: GalleryItemUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update a gallery item"""
    db_item = db.query(GalleryItem).filter(GalleryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    update_data = item_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)
    
    # Update the updated_at timestamp
    db_item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}")
async def delete_gallery_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete a gallery item"""
    db_item = db.query(GalleryItem).filter(GalleryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Delete the associated file if it exists
    filename = db_item.media_filename
    is_video = filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov'))
    
    if is_video:
        file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
    else:
        file_path = os.path.join(IMAGE_UPLOAD_DIR, filename)
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            # Log error but don't fail the deletion
            print(f"Error deleting file {file_path}: {str(e)}")
    
    db.delete(db_item)
    db.commit()
    return {"message": "Gallery item deleted successfully"}


@router.post("/reorder")
async def reorder_gallery_items(
    item_orders: List[dict],  # List of {id: int, display_order: int}
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Reorder gallery items"""
    for item_order in item_orders:
        item_id = item_order.get('id')
        display_order = item_order.get('display_order')
        if item_id is not None and display_order is not None:
            db_item = db.query(GalleryItem).filter(GalleryItem.id == item_id).first()
            if db_item:
                db_item.display_order = display_order
    
    db.commit()
    return {"message": "Gallery items reordered successfully"}

