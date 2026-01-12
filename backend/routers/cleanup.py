"""
Cleanup endpoints for removing orphaned media entries from the database
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict
from database import get_db
from models import GalleryItem, Story, Testimonial, Event, Program, ProgramCategory, SlideshowSlide
from s3_service import file_exists, extract_object_key_from_url, delete_file
from auth_utils import get_current_admin
import os

router = APIRouter()


def check_file_exists_in_s3(filename_or_url: str) -> bool:
    """
    Check if a file exists in S3
    Returns True if file exists, False otherwise
    """
    if not filename_or_url:
        return False
    
    # If it's a URL, extract the object key
    if filename_or_url.startswith('http://') or filename_or_url.startswith('https://'):
        object_key = extract_object_key_from_url(filename_or_url)
        if object_key:
            return file_exists(object_key)
        # If we can't extract, assume it's an external URL and exists
        return True
    
    # If it's just a filename, check common locations
    # Try videos first
    video_key = f"videos/{filename_or_url}"
    if file_exists(video_key):
        return True
    
    # Try images
    image_key = f"images/{filename_or_url}"
    if file_exists(image_key):
        return True
    
    return False


def cleanup_orphaned_media(
    db: Session,
    current_admin = None,  # Optional for programmatic calls
    auto_delete: bool = False  # If True, automatically delete orphaned entries
) -> Dict:
    """
    Find and optionally delete orphaned media entries from the database.
    Orphaned entries are those where the file no longer exists in S3.
    
    Args:
        auto_delete: If True, automatically delete orphaned entries. If False, only report them.
    
    Returns:
        Dictionary with cleanup results
    """
    orphaned_items = {
        "gallery_items": [],
        "stories": [],
        "testimonials": [],
        "events": [],
        "programs": [],
        "program_categories": [],
        "slideshow_slides": []
    }
    
    deleted_count = 0
    
    # Check Gallery Items
    print("🔍 Checking gallery items...")
    gallery_items = db.query(GalleryItem).all()
    for item in gallery_items:
        if not check_file_exists_in_s3(item.media_filename):
            orphaned_items["gallery_items"].append({
                "id": item.id,
                "media_filename": item.media_filename,
                "type": "video" if item.media_filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov')) else "image"
            })
            if auto_delete:
                # Also delete thumbnail if it exists
                if item.thumbnail_url and not check_file_exists_in_s3(item.thumbnail_url):
                    try:
                        thumbnail_key = extract_object_key_from_url(item.thumbnail_url)
                        if thumbnail_key:
                            delete_file(thumbnail_key)
                            print(f"🗑️  Deleted orphaned thumbnail: {thumbnail_key}")
                    except Exception as e:
                        print(f"⚠️  Warning: Could not delete thumbnail: {e}")
                
                db.delete(item)
                deleted_count += 1
                print(f"🗑️  Deleted orphaned gallery item: {item.id} ({item.media_filename})")
    
    # Check Stories
    print("🔍 Checking stories...")
    stories = db.query(Story).filter(Story.video_filename.isnot(None)).all()
    for story in stories:
        if story.video_filename and not check_file_exists_in_s3(story.video_filename):
            orphaned_items["stories"].append({
                "id": story.id,
                "title": story.title,
                "video_filename": story.video_filename
            })
            if auto_delete:
                story.video_filename = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned video from story: {story.id} ({story.title})")
    
    # Check Testimonials
    print("🔍 Checking testimonials...")
    testimonials = db.query(Testimonial).filter(
        (Testimonial.video_filename.isnot(None)) | (Testimonial.image.isnot(None))
    ).all()
    for testimonial in testimonials:
        if testimonial.video_filename and not check_file_exists_in_s3(testimonial.video_filename):
            orphaned_items["testimonials"].append({
                "id": testimonial.id,
                "name": testimonial.name,
                "video_filename": testimonial.video_filename
            })
            if auto_delete:
                testimonial.video_filename = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned video from testimonial: {testimonial.id}")
        
        if testimonial.image and not testimonial.image.startswith('http') and not check_file_exists_in_s3(testimonial.image):
            orphaned_items["testimonials"].append({
                "id": testimonial.id,
                "name": testimonial.name,
                "image": testimonial.image
            })
            if auto_delete:
                testimonial.image = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned image from testimonial: {testimonial.id}")
    
    # Check Events
    print("🔍 Checking events...")
    events = db.query(Event).filter(Event.image.isnot(None)).all()
    for event in events:
        if event.image and not event.image.startswith('http') and not check_file_exists_in_s3(event.image):
            orphaned_items["events"].append({
                "id": event.id,
                "title": event.title,
                "image": event.image
            })
            if auto_delete:
                event.image = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned image from event: {event.id} ({event.title})")
    
    # Check Programs
    print("🔍 Checking programs...")
    programs = db.query(Program).filter(
        (Program.video_filename.isnot(None)) | (Program.image_url.isnot(None))
    ).all()
    for program in programs:
        if program.video_filename and not check_file_exists_in_s3(program.video_filename):
            orphaned_items["programs"].append({
                "id": program.id,
                "title": program.title,
                "video_filename": program.video_filename
            })
            if auto_delete:
                program.video_filename = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned video from program: {program.id}")
        
        if program.image_url and not program.image_url.startswith('http') and not check_file_exists_in_s3(program.image_url):
            orphaned_items["programs"].append({
                "id": program.id,
                "title": program.title,
                "image_url": program.image_url
            })
            if auto_delete:
                program.image_url = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned image from program: {program.id}")
    
    # Check Program Categories
    print("🔍 Checking program categories...")
    categories = db.query(ProgramCategory).filter(
        (ProgramCategory.video_filename.isnot(None)) | (ProgramCategory.image_url.isnot(None))
    ).all()
    for category in categories:
        if category.video_filename and not check_file_exists_in_s3(category.video_filename):
            orphaned_items["program_categories"].append({
                "id": category.id,
                "name": category.name,
                "video_filename": category.video_filename
            })
            if auto_delete:
                category.video_filename = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned video from category: {category.id}")
        
        if category.image_url and not category.image_url.startswith('http') and not check_file_exists_in_s3(category.image_url):
            orphaned_items["program_categories"].append({
                "id": category.id,
                "name": category.name,
                "image_url": category.image_url
            })
            if auto_delete:
                category.image_url = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned image from category: {category.id}")
    
    # Check Slideshow Slides
    print("🔍 Checking slideshow slides...")
    slides = db.query(SlideshowSlide).filter(
        (SlideshowSlide.image_url.isnot(None)) | (SlideshowSlide.image_filename.isnot(None))
    ).all()
    for slide in slides:
        image_to_check = slide.image_url or slide.image_filename
        if image_to_check and not image_to_check.startswith('http') and not check_file_exists_in_s3(image_to_check):
            orphaned_items["slideshow_slides"].append({
                "id": slide.id,
                "title": slide.title,
                "image": image_to_check
            })
            if auto_delete:
                slide.image_url = None
                slide.image_filename = None
                deleted_count += 1
                print(f"🗑️  Cleared orphaned image from slide: {slide.id}")
    
    # Commit changes if auto_delete is enabled
    if auto_delete and deleted_count > 0:
        try:
            db.commit()
            print(f"✅ Committed {deleted_count} cleanup operations")
        except Exception as e:
            db.rollback()
            print(f"❌ Error committing cleanup: {e}")
            raise HTTPException(status_code=500, detail=f"Error committing cleanup: {str(e)}")
    
    # Calculate totals
    total_orphaned = (
        len(orphaned_items["gallery_items"]) +
        len(orphaned_items["stories"]) +
        len(orphaned_items["testimonials"]) +
        len(orphaned_items["events"]) +
        len(orphaned_items["programs"]) +
        len(orphaned_items["program_categories"]) +
        len(orphaned_items["slideshow_slides"])
    )
    
    return {
        "orphaned_count": total_orphaned,
        "deleted_count": deleted_count if auto_delete else 0,
        "orphaned_items": orphaned_items,
        "summary": {
            "gallery_items": len(orphaned_items["gallery_items"]),
            "stories": len(orphaned_items["stories"]),
            "testimonials": len(orphaned_items["testimonials"]),
            "events": len(orphaned_items["events"]),
            "programs": len(orphaned_items["programs"]),
            "program_categories": len(orphaned_items["program_categories"]),
            "slideshow_slides": len(orphaned_items["slideshow_slides"])
        }
    }


@router.post("/orphaned-media")
async def cleanup_orphaned_media_endpoint(
    auto_delete: bool = Query(False, description="If True, automatically delete orphaned entries"),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
) -> Dict:
    """
    Find and optionally delete orphaned media entries from the database.
    Orphaned entries are those where the file no longer exists in S3.
    
    Args:
        auto_delete: If True, automatically delete orphaned entries. If False, only report them.
    
    Returns:
        Dictionary with cleanup results
    """
    return cleanup_orphaned_media(db=db, current_admin=current_admin, auto_delete=auto_delete)


@router.post("/auto-cleanup")
async def auto_cleanup_orphaned_media(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
) -> Dict:
    """
    Automatically delete all orphaned media entries.
    This is a convenience endpoint that calls cleanup with auto_delete=True
    """
    return cleanup_orphaned_media(db=db, current_admin=current_admin, auto_delete=True)

