from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import aiofiles
import os
from datetime import datetime

from database import get_db
from models import Testimonial
from schemas import TestimonialCreate, TestimonialResponse
from auth_utils import get_current_admin

router = APIRouter()


@router.post("/", response_model=TestimonialResponse)
async def create_testimonial(
    name: str = Form(...),
    country: str = Form(""),
    text: str = Form(...),
    rating: int = Form(5),
    video_url: str = Form(""),
    category: str = Form("donor"),
    is_approved: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Handle image upload if provided
    image_filename = None
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/testimonials"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content_bytes = await image.read()
            await f.write(content_bytes)
    
    # Create testimonial in database
    db_testimonial = Testimonial(
        name=name,
        country=country if country else None,
        image=image_filename,
        text=text,
        rating=rating,
        video_url=video_url if video_url else None,
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
    video_url: str = Form(""),
    category: str = Form("donor"),
    is_approved: bool = Form(False),
    image: Optional[UploadFile] = File(None),
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
    testimonial.video_url = video_url if video_url else None
    testimonial.category = category
    testimonial.is_approved = is_approved
    
    # Handle image upload if provided
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/testimonials"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{name.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content_bytes = await image.read()
            await f.write(content_bytes)
        
        # Update image filename
        testimonial.image = image_filename
    
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
    
    db.delete(testimonial)
    db.commit()
    return {"message": "Testimonial deleted"}
