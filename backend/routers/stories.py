from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import aiofiles
import os
from datetime import datetime

from database import get_db
from models import Story
from schemas import StoryCreate, StoryResponse
from auth_utils import get_current_admin

router = APIRouter()


@router.post("/", response_model=StoryResponse)
async def create_story(
    title: str = Form(...),
    summary: str = Form(...),
    content: str = Form(...),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    video_url: str = Form(""),
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
        upload_dir = "uploads/stories"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content_bytes = await image.read()
            await f.write(content_bytes)
    
    # Create story in database
    db_story = Story(
        title=title,
        summary=summary,
        content=content,
        image_filename=image_filename,
        video_url=video_url if video_url else None,
        is_active=is_active,
        is_featured=is_featured
    )
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    return db_story


@router.get("/", response_model=List[StoryResponse])
async def get_stories(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    featured_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(Story)
    if active_only:
        query = query.filter(Story.is_active == True)
    if featured_only:
        query = query.filter(Story.is_featured == True)
    
    stories = query.offset(skip).limit(limit).all()
    return stories


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(story_id: int, db: Session = Depends(get_db)):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


@router.put("/{story_id}", response_model=StoryResponse)
async def update_story(
    story_id: int,
    title: str = Form(...),
    summary: str = Form(...),
    content: str = Form(...),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    video_url: str = Form(""),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    # Update basic fields
    story.title = title
    story.summary = summary
    story.content = content
    story.is_active = is_active
    story.is_featured = is_featured
    story.video_url = video_url if video_url else None
    
    # Handle image upload if provided
    if image and image.filename:
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/stories"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(image.filename)[1]
        image_filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        file_path = os.path.join(upload_dir, image_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content_bytes = await image.read()
            await f.write(content_bytes)
        
        # Update image filename
        story.image_filename = image_filename
    
    db.commit()
    db.refresh(story)
    return story


@router.delete("/{story_id}")
async def delete_story(
    story_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    db.delete(story)
    db.commit()
    return {"message": "Story deleted"}
