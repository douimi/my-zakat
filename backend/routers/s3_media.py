"""
S3 Media Management API endpoints
Provides comprehensive media browser functionality
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from database import get_db
from models import GalleryItem, Story, Testimonial, Event, Program, ProgramCategory, SlideshowSlide, Setting
from s3_service import list_files, file_exists, delete_file, extract_object_key_from_url, get_file_info, get_file_url
from auth_utils import get_current_admin
from datetime import datetime

router = APIRouter()


def get_media_usage(filename_or_url: str, db: Session) -> Dict[str, List]:
    """
    Check where a media file is used across the platform
    Returns a dictionary with usage information
    """
    usage = {
        "gallery_items": [],
        "stories": [],
        "testimonials": [],
        "events": [],
        "programs": [],
        "program_categories": [],
        "slideshow_slides": [],
        "settings": []
    }
    
    # Extract filename if it's a URL
    check_value = filename_or_url
    if filename_or_url.startswith('http://') or filename_or_url.startswith('https://'):
        parts = filename_or_url.split('/')
        check_value = parts[-1] if parts else filename_or_url
    
    # Check Gallery Items
    gallery_items = db.query(GalleryItem).filter(
        GalleryItem.media_filename == filename_or_url
    ).all()
    for item in gallery_items:
        usage["gallery_items"].append({"id": item.id, "display_order": item.display_order})
    
    # Check Stories
    stories = db.query(Story).filter(
        (Story.image_filename == filename_or_url) | (Story.video_filename == filename_or_url)
    ).all()
    for story in stories:
        usage["stories"].append({"id": story.id, "title": story.title})
    
    # Check Testimonials
    testimonials = db.query(Testimonial).filter(
        (Testimonial.image == filename_or_url) | (Testimonial.video_filename == filename_or_url)
    ).all()
    for testimonial in testimonials:
        usage["testimonials"].append({"id": testimonial.id, "name": testimonial.name})
    
    # Check Events
    events = db.query(Event).filter(Event.image == filename_or_url).all()
    for event in events:
        usage["events"].append({"id": event.id, "title": event.title})
    
    # Check Programs
    programs = db.query(Program).filter(
        (Program.image_url == filename_or_url) | (Program.video_filename == filename_or_url)
    ).all()
    for program in programs:
        usage["programs"].append({"id": program.id, "title": program.title})
    
    # Check Program Categories
    categories = db.query(ProgramCategory).filter(
        (ProgramCategory.image_url == filename_or_url) | (ProgramCategory.video_filename == filename_or_url)
    ).all()
    for category in categories:
        usage["program_categories"].append({"id": category.id, "name": category.name})
    
    # Check Slideshow Slides
    slides = db.query(SlideshowSlide).filter(
        (SlideshowSlide.image_url == filename_or_url) | (SlideshowSlide.image_filename == filename_or_url)
    ).all()
    for slide in slides:
        usage["slideshow_slides"].append({"id": slide.id, "title": slide.title})
    
    # Check Settings
    settings = db.query(Setting).filter(Setting.value == filename_or_url).all()
    for setting in settings:
        usage["settings"].append({"key": setting.key, "value": setting.value})
    
    return usage


@router.get("/browse")
async def browse_s3_media(
    media_type: str = Query("all", description="Filter by media type: all, images, videos"),
    prefix: str = Query("", description="Filter by S3 prefix (e.g., 'images/', 'videos/')"),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
) -> Dict:
    """
    Browse all media files in S3 with usage information
    """
    all_media = []
    
    # Determine which prefixes to check
    prefixes_to_check = []
    if media_type == "images" or media_type == "all":
        prefixes_to_check.append("images/")
    if media_type == "videos" or media_type == "all":
        prefixes_to_check.append("videos/")
    
    # If a specific prefix is provided, use it
    if prefix:
        prefixes_to_check = [prefix] if prefix.endswith('/') else [f"{prefix}/"]
    
    # List files from S3
    for prefix_path in prefixes_to_check:
        try:
            s3_files = list_files(prefix_path)
            for file_info in s3_files:
                object_key = file_info['key']
                filename = object_key.split('/')[-1]
                
                # Determine file type
                is_image = filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'))
                is_video = filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv'))
                
                # Skip if doesn't match requested type
                if media_type == "images" and not is_image:
                    continue
                if media_type == "videos" and not is_video:
                    continue
                
                # Get file info
                file_metadata = get_file_info(object_key) or {}
                
                # Get usage information
                file_url = get_file_url(object_key)
                usage = get_media_usage(file_url, db)
                
                # Count total usage
                total_usage = sum(len(v) for v in usage.values())
                
                media_item = {
                    "object_key": object_key,
                    "filename": filename,
                    "url": file_url,
                    "size": file_info.get('size', 0),
                    "content_type": file_metadata.get('content_type', 'application/octet-stream'),
                    "last_modified": file_info.get('last_modified').isoformat() if file_info.get('last_modified') else None,
                    "type": "image" if is_image else "video" if is_video else "other",
                    "usage": usage,
                    "usage_count": total_usage,
                    "prefix": prefix_path.rstrip('/')
                }
                
                all_media.append(media_item)
        except Exception as e:
            print(f"Error listing files from S3 prefix {prefix_path}: {e}")
    
    # Sort by last modified, newest first
    all_media.sort(key=lambda x: x.get("last_modified") or "", reverse=True)
    
    return {
        "media": all_media,
        "total": len(all_media),
        "filters": {
            "media_type": media_type,
            "prefix": prefix
        }
    }


@router.get("/{object_key:path}/info")
async def get_media_info(
    object_key: str,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
) -> Dict:
    """
    Get detailed information about a specific media file
    """
    # Decode URL-encoded object key
    from urllib.parse import unquote
    object_key = unquote(object_key)
    
    # Check if file exists
    if not file_exists(object_key):
        raise HTTPException(status_code=404, detail=f"File not found in S3: {object_key}")
    
    # Get file metadata
    file_info = get_file_info(object_key)
    if not file_info:
        raise HTTPException(status_code=404, detail=f"Could not retrieve file info: {object_key}")
    
    # Get usage information
    file_url = get_file_url(object_key)
    usage = get_media_usage(file_url, db)
    
    filename = object_key.split('/')[-1]
    is_image = filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'))
    is_video = filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv'))
    
    return {
        "object_key": object_key,
        "filename": filename,
        "url": file_url,
        "size": file_info.get('size', 0),
        "content_type": file_info.get('content_type', 'application/octet-stream'),
        "last_modified": file_info.get('last_modified').isoformat() if file_info.get('last_modified') else None,
        "type": "image" if is_image else "video" if is_video else "other",
        "usage": usage,
        "usage_count": sum(len(v) for v in usage.values())
    }


@router.delete("/{object_key:path}")
async def delete_s3_media(
    object_key: str,
    cleanup_db: bool = Query(True, description="Automatically clean up database references"),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
) -> Dict:
    """
    Delete a media file from S3 and optionally clean up database references
    """
    # Decode URL-encoded object key
    from urllib.parse import unquote
    object_key = unquote(object_key)
    
    # Check if file exists
    if not file_exists(object_key):
        raise HTTPException(status_code=404, detail=f"File not found in S3: {object_key}")
    
    # Get usage information before deletion
    file_url = get_file_url(object_key)
    usage = get_media_usage(file_url, db)
    usage_count = sum(len(v) for v in usage.values())
    
    # Delete from S3
    success = delete_file(object_key, cleanup_db=cleanup_db)
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete file from S3: {object_key}")
    
    return {
        "message": f"File deleted successfully",
        "object_key": object_key,
        "usage_count": usage_count,
        "usage": usage,
        "cleanup_db": cleanup_db
    }

