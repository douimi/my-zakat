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
from s3_service import upload_file, delete_file, generate_object_key

router = APIRouter()


@router.post("/", response_model=StoryResponse)
async def create_story(
    title: str = Form(...),
    summary: str = Form(...),
    content: str = Form(...),
    image_filename: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Handle video upload if provided
    video_filename = None
    if video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()
        
        # Upload to S3
        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "story_video"}
            )
            video_filename = s3_url
        except Exception as e:
            # Fallback to local storage
            upload_dir = "uploads/stories"
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, filename)
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(content_bytes)
            video_filename = filename
    
    # Create story in database
    db_story = Story(
        title=title,
        summary=summary,
        content=content,
        image_filename=image_filename if image_filename else None,
        video_filename=video_filename,
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
    image_filename: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    remove_video: Optional[bool] = Form(False),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    # Handle video removal if requested
    if remove_video:
        if story.video_filename:
            # Check if it's an S3 URL or local filename
            if story.video_filename.startswith('http://') or story.video_filename.startswith('https://'):
                # Extract object key from URL and delete from S3
                try:
                    # Extract key from URL (format: endpoint/bucket/key)
                    parts = story.video_filename.split('/')
                    if len(parts) >= 3:
                        # Find the bucket name and reconstruct key
                        bucket_idx = -1
                        for i, part in enumerate(parts):
                            if 'myzakat-media' in part or 'stories' in part:
                                bucket_idx = i
                                break
                        if bucket_idx >= 0 and bucket_idx < len(parts) - 1:
                            object_key = '/'.join(parts[bucket_idx + 1:])
                            delete_file(object_key)
                except Exception as e:
                    print(f"Error deleting video from S3: {e}")
            else:
                # Local file
                old_path = os.path.join("uploads/stories", story.video_filename)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Error deleting video: {e}")
        story.video_filename = None
    # Handle video upload if provided
    elif video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Delete old video if it exists
        if story.video_filename:
            if story.video_filename.startswith('http://') or story.video_filename.startswith('https://'):
                try:
                    parts = story.video_filename.split('/')
                    if len(parts) >= 3:
                        bucket_idx = -1
                        for i, part in enumerate(parts):
                            if 'myzakat-media' in part or 'stories' in part:
                                bucket_idx = i
                                break
                        if bucket_idx >= 0 and bucket_idx < len(parts) - 1:
                            object_key = '/'.join(parts[bucket_idx + 1:])
                            delete_file(object_key)
                except Exception as e:
                    print(f"Error deleting old video from S3: {e}")
            else:
                old_path = os.path.join("uploads/stories", story.video_filename)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Error deleting old video: {e}")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()
        
        # Upload to S3
        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "story_video"}
            )
            story.video_filename = s3_url
        except Exception as e:
            # Fallback to local storage
            upload_dir = "uploads/stories"
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, filename)
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(content_bytes)
            story.video_filename = filename
    
    # Handle image removal/update
    old_image = story.image_filename
    if image_filename is not None:
        # If clearing image or changing to a new one, delete old file
        if old_image and (not image_filename or image_filename != old_image):
            old_path = os.path.join("uploads/stories", old_image)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Warning: Could not delete old image file {old_path}: {e}")
        story.image_filename = image_filename
    
    # Update basic fields
    story.title = title
    story.summary = summary
    story.content = content
    story.is_active = is_active
    story.is_featured = is_featured
    
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
    
    # Delete associated video file if exists
    if story.video_filename:
        if story.video_filename.startswith('http://') or story.video_filename.startswith('https://'):
            # S3 URL - extract key and delete
            try:
                parts = story.video_filename.split('/')
                if len(parts) >= 3:
                    bucket_idx = -1
                    for i, part in enumerate(parts):
                        if 'myzakat-media' in part or 'stories' in part:
                            bucket_idx = i
                            break
                    if bucket_idx >= 0 and bucket_idx < len(parts) - 1:
                        object_key = '/'.join(parts[bucket_idx + 1:])
                        delete_file(object_key)
            except Exception as e:
                print(f"Warning: Could not delete video from S3: {e}")
        else:
            # Local file
            video_path = os.path.join("uploads/stories", story.video_filename)
            if os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except Exception as e:
                    print(f"Warning: Could not delete video file {video_path}: {e}")
    
    # Delete associated image file if exists (images are typically URLs, not files)
    if story.image_filename and not (story.image_filename.startswith('http://') or story.image_filename.startswith('https://')):
        image_path = os.path.join("uploads/stories", story.image_filename)
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                print(f"Warning: Could not delete image file {image_path}: {e}")
    
    db.delete(story)
    db.commit()
    return {"message": "Story deleted"}
