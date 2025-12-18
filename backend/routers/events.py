from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import aiofiles
import os
from datetime import datetime

from database import get_db
from models import Event
from schemas import EventCreate, EventResponse
from auth_utils import get_current_admin

router = APIRouter()


@router.post("/", response_model=EventResponse)
async def create_event(
    title: str = Form(...),
    description: str = Form(...),
    date: str = Form(...),
    location: str = Form(...),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Parse the date string
    try:
        event_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Handle image - prioritize file upload over URL
    image_value = None
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/events"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await image.read()
            await f.write(content)
        
        image_value = image_filename
    elif image_url and image_url.strip():
        # Use image URL if provided and no file upload
        image_value = image_url.strip()
    
    # Create event in database
    db_event = Event(
        title=title,
        description=description,
        date=event_date,
        location=location,
        image=image_value
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.get("/", response_model=List[EventResponse])
async def get_events(
    skip: int = 0,
    limit: int = 100,
    upcoming_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(Event)
    if upcoming_only:
        query = query.filter(Event.date >= datetime.utcnow())
    
    events = query.order_by(Event.created_at.desc()).offset(skip).limit(limit).all()
    return events


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    title: str = Form(...),
    description: str = Form(...),
    date: str = Form(...),
    location: str = Form(...),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Parse the date string
    try:
        event_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Update basic fields
    event.title = title
    event.description = description
    event.date = event_date
    event.location = location
    
    # Handle image - prioritize file upload over URL
    old_image = event.image  # Store old image for deletion
    
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/events"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Delete old image file if it exists and is a filename (not a URL)
        if old_image and not old_image.startswith(('http://', 'https://')):
            old_path = os.path.join(upload_dir, old_image)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Warning: Could not delete old image file {old_path}: {e}")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await image.read()
            await f.write(content)
        
        # Update image filename
        event.image = image_filename
    elif image_url is not None:
        # Delete old image file if clearing/changing image and old one was a filename
        if old_image and not old_image.startswith(('http://', 'https://')):
            old_path = os.path.join("uploads/events", old_image)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Warning: Could not delete old image file {old_path}: {e}")
        
        # Update image URL if provided (empty string clears the image)
        event.image = image_url.strip() if image_url.strip() else None
    
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Delete associated image file if it exists and is a filename (not a URL)
    if event.image and not event.image.startswith(('http://', 'https://')):
        image_path = os.path.join("uploads/events", event.image)
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                print(f"Warning: Could not delete image file {image_path}: {e}")
    
    db.delete(event)
    db.commit()
    return {"message": "Event deleted"}


@router.post("/upload-image")
async def upload_event_image(
    file: UploadFile = File(...),
    current_admin = Depends(get_current_admin)
):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create uploads directory if it doesn't exist
    upload_dir = "uploads/images/events"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    return {"filename": filename, "path": f"/uploads/images/events/{filename}"}
