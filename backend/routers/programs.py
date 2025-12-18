from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
import re
from pathlib import Path

from database import get_db
from models import Program, ProgramCategory
from schemas import ProgramCreate, ProgramUpdate, ProgramResponse
from auth_utils import get_current_admin

router = APIRouter()

# Ensure upload directory exists
UPLOAD_DIR = Path("uploads/programs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=List[ProgramResponse])
async def get_programs(
    category_id: Optional[int] = None,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get all programs, optionally filtered by category and active status"""
    try:
        import re
        
        query = db.query(Program)
        
        if category_id:
            query = query.filter(Program.category_id == category_id)
        
        if active_only:
            query = query.filter(Program.is_active == True)
        
        programs = query.order_by(Program.display_order, Program.title).all()
        
        # Fix any programs with NULL slugs
        needs_commit = False
        for program in programs:
            if not program.slug and program.title:
                # Generate slug from title
                slug = re.sub(r'[^\w\s-]', '', program.title.lower())
                slug = re.sub(r'[-\s]+', '-', slug).strip('-')
                # Ensure uniqueness
                base_slug = slug
                counter = 1
                while db.query(Program).filter(Program.slug == slug).first():
                    slug = f"{base_slug}-{counter}"
                    counter += 1
                program.slug = slug
                needs_commit = True
        
        if needs_commit:
            db.commit()
            # Refresh all programs
            programs = query.order_by(Program.display_order, Program.title).all()
        
        return programs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching programs: {str(e)}")


@router.get("/slug/{slug}", response_model=ProgramResponse)
async def get_program_by_slug(slug: str, db: Session = Depends(get_db)):
    """Get a specific program by slug"""
    try:
        program = db.query(Program).filter(Program.slug == slug).first()
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")
        return program
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching program: {str(e)}")


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(program_id: int, db: Session = Depends(get_db)):
    """Get a specific program by ID"""
    try:
        program = db.query(Program).filter(Program.id == program_id).first()
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")
        return program
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching program: {str(e)}")


@router.post("/", response_model=ProgramResponse)
async def create_program(
    program: ProgramCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Create a new program"""
    # Verify category exists
    category = db.query(ProgramCategory).filter(ProgramCategory.id == program.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if slug already exists
    existing = db.query(Program).filter(Program.slug == program.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Program with this slug already exists")
    
    db_program = Program(**program.dict())
    db.add(db_program)
    db.commit()
    db.refresh(db_program)
    return db_program


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(
    program_id: int,
    program_update: ProgramUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update a program"""
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    # If category_id is being updated, verify it exists
    update_data = program_update.dict(exclude_unset=True)
    if 'category_id' in update_data:
        category = db.query(ProgramCategory).filter(ProgramCategory.id == update_data['category_id']).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if slug conflicts with other programs
    if 'slug' in update_data:
        existing = db.query(Program).filter(
            Program.slug == update_data['slug'],
            Program.id != program_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Program with this slug already exists")
    
    # Handle media file deletion when fields are updated
    # Delete old video if video_filename is being cleared or changed
    if 'video_filename' in update_data:
        old_video = program.video_filename
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
        old_image = program.image_url
        new_image = update_data['image_url']
        # If old image was a filename (not URL) and we're changing it
        if old_image and not old_image.startswith(('http://', 'https://')):
            if not new_image or new_image.startswith(('http://', 'https://')) or new_image != old_image:
                # Old image was a filename, delete it
                old_path = Path("uploads/programs") / old_image
                if old_path.exists():
                    try:
                        old_path.unlink()
                    except Exception as e:
                        print(f"Warning: Could not delete old image file {old_path}: {e}")
    
    # Update fields
    for field, value in update_data.items():
        setattr(program, field, value)
    
    db.commit()
    db.refresh(program)
    return program


@router.delete("/{program_id}")
async def delete_program(
    program_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete a program"""
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    # Delete associated video file if exists
    if program.video_filename and not program.video_filename.startswith(('http://', 'https://')):
        video_path = UPLOAD_DIR / program.video_filename
        if video_path.exists():
            try:
                video_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete video file {video_path}: {e}")
    
    # Delete associated image file if exists and is a filename (not URL)
    if program.image_url and not program.image_url.startswith(('http://', 'https://')):
        image_path = Path("uploads/programs") / program.image_url
        if image_path.exists():
            try:
                image_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete image file {image_path}: {e}")
    
    db.delete(program)
    db.commit()
    return {"message": "Program deleted successfully"}


@router.post("/{program_id}/upload-video", response_model=ProgramResponse)
async def upload_program_video(
    program_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Upload a video for a program"""
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    # Generate filename
    file_ext = Path(file.filename).suffix
    filename = f"program_{program_id}_{program.slug}{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Delete old video if exists
    if program.video_filename:
        old_path = UPLOAD_DIR / program.video_filename
        if old_path.exists():
            try:
                old_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete old video {old_path}: {e}")
    
    # Save new video
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        program.video_filename = filename
        db.commit()
        db.refresh(program)
        return program
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")

