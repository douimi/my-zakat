from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import aiofiles
import os
from datetime import datetime
from pathlib import Path

from database import get_db
from auth_utils import get_current_admin
from models import Story, Testimonial, Setting, GalleryItem

router = APIRouter()

# Video upload directory
VIDEO_UPLOAD_DIR = "uploads/media/videos"
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/upload-video")
async def upload_video(
    file: UploadFile = File(...),
    current_admin = Depends(get_current_admin)
):
    """
    Upload a video file for use across the platform
    """
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    # Check file size
    file_content = await file.read()
    if len(file_content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail=f"File size too large. Maximum size is {MAX_VIDEO_SIZE / (1024*1024)}MB")
    
    # Create uploads directory if it doesn't exist
    os.makedirs(VIDEO_UPLOAD_DIR, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = os.path.splitext(file.filename)[1] if file.filename else '.mp4'
    filename = f"video_{timestamp}{file_extension}"
    file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(file_content)
    
    return {
        "filename": filename,
        "path": f"/api/uploads/media/videos/{filename}",
        "size": len(file_content),
        "content_type": file.content_type
    }


@router.get("/videos")
async def list_videos(
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all uploaded videos from all directories (media/videos, stories, testimonials)
    """
    videos = []
    
    # Check media/videos directory (general videos)
    if os.path.exists(VIDEO_UPLOAD_DIR):
        for filename in os.listdir(VIDEO_UPLOAD_DIR):
            file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                # Check where this video is used
                used_in = []
                if db.query(Story).filter(Story.video_filename == filename).first():
                    used_in.append("stories")
                if db.query(Testimonial).filter(Testimonial.video_filename == filename).first():
                    used_in.append("testimonials")
                if db.query(GalleryItem).filter(GalleryItem.media_filename == filename).first():
                    used_in.append("gallery")
                
                videos.append({
                    "filename": filename,
                    "path": f"/api/uploads/media/videos/{filename}",
                    "size": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "location": "media/videos",
                    "used_in": used_in
                })
    
    # Check stories directory
    stories_dir = "uploads/stories"
    if os.path.exists(stories_dir):
        for filename in os.listdir(stories_dir):
            file_path = os.path.join(stories_dir, filename)
            if os.path.isfile(file_path):
                # Check if it's a video file
                if filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov')):
                    stat = os.stat(file_path)
                    videos.append({
                        "filename": filename,
                        "path": f"/api/uploads/stories/{filename}",
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "location": "stories",
                        "used_in": ["stories"] if db.query(Story).filter(Story.video_filename == filename).first() else []
                    })
    
    # Check testimonials directory
    testimonials_dir = "uploads/testimonials"
    if os.path.exists(testimonials_dir):
        for filename in os.listdir(testimonials_dir):
            file_path = os.path.join(testimonials_dir, filename)
            if os.path.isfile(file_path):
                # Check if it's a video file
                if filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov')):
                    stat = os.stat(file_path)
                    videos.append({
                        "filename": filename,
                        "path": f"/api/uploads/testimonials/{filename}",
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "location": "testimonials",
                        "used_in": ["testimonials"] if db.query(Testimonial).filter(Testimonial.video_filename == filename).first() else []
                    })
    
    # Sort by creation time, newest first
    videos.sort(key=lambda x: x["created_at"], reverse=True)
    
    return videos


@router.delete("/videos/{filename}")
async def delete_video(
    filename: str,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """
    Delete a video file and remove references from all sections where it's used
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Check if video exists in any directory
    media_video_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
    stories_video_path = os.path.join("uploads/stories", filename)
    testimonials_video_path = os.path.join("uploads/testimonials", filename)
    
    video_exists_in_media = os.path.exists(media_video_path)
    video_exists_in_stories = os.path.exists(stories_video_path)
    video_exists_in_testimonials = os.path.exists(testimonials_video_path)
    
    if not video_exists_in_media and not video_exists_in_stories and not video_exists_in_testimonials:
        raise HTTPException(status_code=404, detail="Video not found")
    
    try:
        # Remove references from Stories
        stories_with_video = db.query(Story).filter(Story.video_filename == filename).all()
        for story in stories_with_video:
            story.video_filename = None
        if stories_with_video:
            db.commit()
        
        # Remove references from Testimonials
        testimonials_with_video = db.query(Testimonial).filter(Testimonial.video_filename == filename).all()
        for testimonial in testimonials_with_video:
            testimonial.video_filename = None
        if testimonials_with_video:
            db.commit()
        
        # Remove references from Settings (gallery items and hero video)
        settings_cleared = []
        
        # Check gallery items (gallery_item_1 through gallery_item_6) - legacy settings
        gallery_keys = [f'gallery_item_{i}' for i in range(1, 7)]
        for key in gallery_keys:
            setting = db.query(Setting).filter(Setting.key == key).first()
            if setting and setting.value == filename:
                setting.value = ''
                settings_cleared.append(key)
        
        # Check hero_video
        hero_video_setting = db.query(Setting).filter(Setting.key == 'hero_video').first()
        if hero_video_setting and hero_video_setting.value == filename:
            hero_video_setting.value = ''
            settings_cleared.append('hero_video')
        
        # Check program videos (program_video_1, program_video_2, program_video_3)
        program_video_keys = [f'program_video_{i}' for i in range(1, 4)]
        for key in program_video_keys:
            setting = db.query(Setting).filter(Setting.key == key).first()
            if setting and setting.value == filename:
                setting.value = ''
                settings_cleared.append(key)
        
        # Remove references from Gallery Items table (new gallery system)
        gallery_items_with_video = db.query(GalleryItem).filter(GalleryItem.media_filename == filename).all()
        for gallery_item in gallery_items_with_video:
            db.delete(gallery_item)
        if gallery_items_with_video:
            db.commit()
        
        # Commit settings changes if any
        if settings_cleared:
            db.commit()
        
        # Delete the actual file(s)
        deleted_files = []
        if video_exists_in_media:
            os.remove(media_video_path)
            deleted_files.append(f"media/videos/{filename}")
        if video_exists_in_stories:
            os.remove(stories_video_path)
            deleted_files.append(f"stories/{filename}")
        if video_exists_in_testimonials:
            os.remove(testimonials_video_path)
            deleted_files.append(f"testimonials/{filename}")
        
        # Count affected records
        affected_count = len(stories_with_video) + len(testimonials_with_video) + len(gallery_items_with_video)
        
        message = f"Video deleted successfully"
        if affected_count > 0 or settings_cleared:
            parts = []
            if len(stories_with_video) > 0:
                parts.append(f"{len(stories_with_video)} story/stories")
            if len(testimonials_with_video) > 0:
                parts.append(f"{len(testimonials_with_video)} testimonial/testimonials")
            if len(gallery_items_with_video) > 0:
                parts.append(f"{len(gallery_items_with_video)} gallery item(s)")
            if parts:
                message += f". Removed from {', '.join(parts)}"
            if settings_cleared:
                message += f" and cleared from {len(settings_cleared)} setting(s): {', '.join(settings_cleared)}"
        
        return {
            "message": message,
            "deleted_files": deleted_files,
            "affected_stories": len(stories_with_video),
            "affected_testimonials": len(testimonials_with_video),
            "affected_gallery_items": len(gallery_items_with_video),
            "cleared_settings": settings_cleared
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting video: {str(e)}")


@router.get("/videos/{filename}/info")
async def get_video_info(
    filename: str,
    current_admin = Depends(get_current_admin)
):
    """
    Get information about a video file
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    stat = os.stat(file_path)
    return {
        "filename": filename,
        "path": f"/api/uploads/media/videos/{filename}",
        "size": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
    }


@router.get("/videos/{filename}/stream")
async def stream_video(
    filename: str,
    current_admin = Depends(get_current_admin)
):
    """
    Stream video file with proper headers for video playback
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Determine content type based on file extension
    content_type = "video/mp4"  # default
    if filename.lower().endswith('.webm'):
        content_type = "video/webm"
    elif filename.lower().endswith('.ogg'):
        content_type = "video/ogg"
    elif filename.lower().endswith('.avi'):
        content_type = "video/x-msvideo"
    elif filename.lower().endswith('.mov'):
        content_type = "video/quicktime"
    
    return FileResponse(
        file_path,
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Type": content_type,
        }
    )

