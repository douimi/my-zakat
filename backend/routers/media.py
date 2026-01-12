from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
from pathlib import Path

from database import get_db
from auth_utils import get_current_admin
from models import Story, Testimonial, Setting, GalleryItem, Event
from s3_service import upload_file, delete_file, file_exists, get_file_url, generate_object_key, list_files, get_file_info, extract_object_key_from_url

router = APIRouter()

# Video upload directory
VIDEO_UPLOAD_DIR = "uploads/media/videos"
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB


@router.get("/videos")
async def list_videos(
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all uploaded videos from S3 and local filesystem
    """
    videos = []
    video_extensions = ('.mp4', '.webm', '.ogg', '.avi', '.mov')
    
    # Helper function to check where a video is used
    def get_used_in(filename_or_url: str) -> list:
        used_in = []
        # Extract filename from URL if needed
        check_value = filename_or_url
        if filename_or_url.startswith('http://') or filename_or_url.startswith('https://'):
            # Extract filename from S3 URL
            parts = filename_or_url.split('/')
            check_value = parts[-1] if parts else filename_or_url
        
        if db.query(Story).filter(Story.video_filename == filename_or_url).first():
            used_in.append("stories")
        if db.query(Testimonial).filter(Testimonial.video_filename == filename_or_url).first():
            used_in.append("testimonials")
        if db.query(GalleryItem).filter(GalleryItem.media_filename == filename_or_url).first():
            used_in.append("gallery")
        # Check Settings for hero_video and program_videos
        hero_video = db.query(Setting).filter(Setting.key == 'hero_video', Setting.value == filename_or_url).first()
        if hero_video:
            used_in.append("hero")
        program_videos = db.query(Setting).filter(Setting.key.like('program_video_%'), Setting.value == filename_or_url).all()
        if program_videos:
            used_in.append("programs")
        return used_in
    
    # Check S3 for videos
    try:
        # List videos from S3 - simple structure: videos/
        s3_files = list_files("videos")
        for file_info in s3_files:
            filename = file_info['key'].split('/')[-1]
            if filename.lower().endswith(video_extensions):
                used_in = get_used_in(file_info['url'])
                videos.append({
                    "filename": filename,
                    "url": file_info['url'],
                    "path": file_info['url'],  # Keep for backward compatibility
                    "size": file_info['size'],
                    "created_at": file_info['last_modified'].isoformat() if file_info.get('last_modified') else datetime.utcnow().isoformat(),
                    "modified_at": file_info['last_modified'].isoformat() if file_info.get('last_modified') else datetime.utcnow().isoformat(),
                    "location": "videos",
                    "used_in": used_in,
                    "exists_in_s3": True  # Mark that file exists in S3
                })
    except Exception as e:
        print(f"Error listing videos from S3: {e}")
    
    # Also check database for videos that might be referenced but deleted from S3
    # This helps identify orphaned database entries
    try:
        from s3_service import file_exists, extract_object_key_from_url
        
        # Check gallery items for videos
        gallery_videos = db.query(GalleryItem).filter(
            GalleryItem.media_filename.like('%.mp4')
            | GalleryItem.media_filename.like('%.webm')
            | GalleryItem.media_filename.like('%.ogg')
            | GalleryItem.media_filename.like('%.avi')
            | GalleryItem.media_filename.like('%.mov')
            | GalleryItem.media_filename.like('%videos/%')
        ).all()
        
        for gallery_item in gallery_videos:
            filename_or_url = gallery_item.media_filename
            # Extract filename if it's a URL
            if filename_or_url.startswith('http://') or filename_or_url.startswith('https://'):
                object_key = extract_object_key_from_url(filename_or_url)
                if object_key and object_key.startswith('videos/'):
                    filename = object_key.split('/')[-1]
                    # Check if already in videos list
                    if not any(v.get('filename') == filename for v in videos):
                        # Check if file exists in S3
                        exists = file_exists(object_key)
                        if not exists:
                            # File doesn't exist in S3, mark as orphaned
                            videos.append({
                                "filename": filename,
                                "url": filename_or_url,
                                "path": filename_or_url,
                                "size": 0,
                                "created_at": gallery_item.created_at.isoformat() if gallery_item.created_at else datetime.utcnow().isoformat(),
                                "modified_at": gallery_item.updated_at.isoformat() if gallery_item.updated_at else datetime.utcnow().isoformat(),
                                "location": "database",
                                "used_in": get_used_in(filename_or_url),
                                "exists_in_s3": False,  # Mark as not existing in S3
                                "orphaned": True  # Mark as orphaned database entry
                            })
    except Exception as e:
        print(f"Error checking database for orphaned videos: {e}")
    
    # Check local filesystem as fallback
    # Check media/videos directory (general videos)
    if os.path.exists(VIDEO_UPLOAD_DIR):
        for filename in os.listdir(VIDEO_UPLOAD_DIR):
            file_path = os.path.join(VIDEO_UPLOAD_DIR, filename)
            if os.path.isfile(file_path) and filename.lower().endswith(video_extensions):
                # Skip if already found in S3
                if not any(v.get('filename') == filename and v.get('location') == 'media/videos' for v in videos):
                    stat = os.stat(file_path)
                    used_in = get_used_in(filename)
                    videos.append({
                        "filename": filename,
                        "path": f"/api/uploads/media/videos/{filename}",
                        "url": f"/api/uploads/media/videos/{filename}",
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
            if os.path.isfile(file_path) and filename.lower().endswith(video_extensions):
                if not any(v.get('filename') == filename and v.get('location') == 'stories' for v in videos):
                    stat = os.stat(file_path)
                    used_in = get_used_in(filename)
                    videos.append({
                        "filename": filename,
                        "path": f"/api/uploads/stories/{filename}",
                        "url": f"/api/uploads/stories/{filename}",
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "location": "stories",
                        "used_in": used_in
                    })
    
    # Check testimonials directory
    testimonials_dir = "uploads/testimonials"
    if os.path.exists(testimonials_dir):
        for filename in os.listdir(testimonials_dir):
            file_path = os.path.join(testimonials_dir, filename)
            if os.path.isfile(file_path) and filename.lower().endswith(video_extensions):
                if not any(v.get('filename') == filename and v.get('location') == 'testimonials' for v in videos):
                    stat = os.stat(file_path)
                    used_in = get_used_in(filename)
                    videos.append({
                        "filename": filename,
                        "path": f"/api/uploads/testimonials/{filename}",
                        "url": f"/api/uploads/testimonials/{filename}",
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "location": "testimonials",
                        "used_in": used_in
                    })
    
    # Sort by creation time, newest first
    videos.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return videos


@router.get("/images")
async def list_images(
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all uploaded images from S3 and local filesystem for media picker
    """
    images = []
    image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp')
    
    # Helper function to check where an image is used
    def get_used_in(filename_or_url: str) -> list:
        used_in = []
        check_value = filename_or_url
        if filename_or_url.startswith('http://') or filename_or_url.startswith('https://'):
            parts = filename_or_url.split('/')
            check_value = parts[-1] if parts else filename_or_url
        
        if db.query(Story).filter(Story.image_filename == filename_or_url).first():
            used_in.append("stories")
        if db.query(Testimonial).filter(Testimonial.image == filename_or_url).first():
            used_in.append("testimonials")
        if db.query(GalleryItem).filter(GalleryItem.media_filename == filename_or_url).first():
            used_in.append("gallery")
        # Check Event images
        if db.query(Event).filter(Event.image == filename_or_url).first():
            used_in.append("events")
        return used_in
    
    # Check S3 for images
    try:
        # List images from S3 - simple structure: images/
        s3_files = list_files("images")
        for file_info in s3_files:
            filename = file_info['key'].split('/')[-1]
            if filename.lower().endswith(image_extensions):
                used_in = get_used_in(file_info['url'])
                images.append({
                    "filename": filename,
                    "url": file_info['url'],
                    "path": file_info['url'],
                    "size": file_info['size'],
                    "created_at": file_info['last_modified'].isoformat() if file_info.get('last_modified') else datetime.utcnow().isoformat(),
                    "modified_at": file_info['last_modified'].isoformat() if file_info.get('last_modified') else datetime.utcnow().isoformat(),
                    "location": "images",
                    "used_in": used_in
                })
    except Exception as e:
        print(f"Error listing images from S3: {e}")
    
    # Check local filesystem as fallback
    image_dirs = [
        ("uploads/media/images", "media/images"),
        ("uploads/stories", "stories"),
        ("uploads/testimonials", "testimonials"),
        ("uploads/events", "events"),
    ]
    
    for upload_dir, location in image_dirs:
        if os.path.exists(upload_dir):
            for filename in os.listdir(upload_dir):
                file_path = os.path.join(upload_dir, filename)
                if os.path.isfile(file_path) and filename.lower().endswith(image_extensions):
                    # Skip if already found in S3
                    if not any(img.get('filename') == filename and img.get('location') == location for img in images):
                        stat = os.stat(file_path)
                        used_in = get_used_in(filename)
                        images.append({
                            "filename": filename,
                            "path": f"/api/uploads/{location}/{filename}",
                            "url": f"/api/uploads/{location}/{filename}",
                            "size": stat.st_size,
                            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            "location": location,
                            "used_in": used_in
                        })
    
    # Sort by creation time, newest first
    images.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return images


@router.get("/media-picker")
async def get_media_picker(
    media_type: str = "all",  # "all", "images", "videos"
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get all media (images and/or videos) for the media picker
    """
    result = {}
    
    if media_type in ("all", "images"):
        images = await list_images(current_admin, db)
        result["images"] = images
    
    if media_type in ("all", "videos"):
        videos = await list_videos(current_admin, db)
        result["videos"] = videos
    
    return result



