from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
import re

from database import get_db
from models import UrgentNeed
from schemas import UrgentNeedCreate, UrgentNeedUpdate, UrgentNeedResponse
from auth_utils import get_current_admin

router = APIRouter()


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug"""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')


@router.get("/", response_model=List[UrgentNeedResponse])
async def get_urgent_needs(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all urgent needs, optionally filtered to active only"""
    query = db.query(UrgentNeed)
    if active_only:
        query = query.filter(UrgentNeed.is_active == True)
    needs = query.order_by(UrgentNeed.display_order, UrgentNeed.id).all()
    return needs


@router.get("/{slug}", response_model=UrgentNeedResponse)
async def get_urgent_need_by_slug(slug: str, db: Session = Depends(get_db)):
    """Get a specific urgent need by slug"""
    need = db.query(UrgentNeed).filter(UrgentNeed.slug == slug).first()
    if not need:
        raise HTTPException(status_code=404, detail="Urgent need not found")
    if not need.is_active:
        raise HTTPException(status_code=404, detail="Urgent need not found")
    return need


@router.get("/id/{need_id}", response_model=UrgentNeedResponse)
async def get_urgent_need_by_id(need_id: int, db: Session = Depends(get_db)):
    """Get a specific urgent need by ID (for admin)"""
    need = db.query(UrgentNeed).filter(UrgentNeed.id == need_id).first()
    if not need:
        raise HTTPException(status_code=404, detail="Urgent need not found")
    return need


@router.post("/", response_model=UrgentNeedResponse)
async def create_urgent_need(
    need: UrgentNeedCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Create a new urgent need"""
    # Generate slug if not provided
    if not need.slug:
        need.slug = slugify(need.title)
    
    # Check if slug already exists
    existing = db.query(UrgentNeed).filter(UrgentNeed.slug == need.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")
    
    db_need = UrgentNeed(**need.dict())
    db.add(db_need)
    db.commit()
    db.refresh(db_need)
    return db_need


@router.put("/{need_id}", response_model=UrgentNeedResponse)
async def update_urgent_need(
    need_id: int,
    need_update: UrgentNeedUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update an urgent need"""
    need = db.query(UrgentNeed).filter(UrgentNeed.id == need_id).first()
    if not need:
        raise HTTPException(status_code=404, detail="Urgent need not found")
    
    # Handle slug update
    update_data = need_update.dict(exclude_unset=True)
    if 'slug' in update_data and update_data['slug']:
        # Check if new slug already exists (excluding current need)
        existing = db.query(UrgentNeed).filter(
            UrgentNeed.slug == update_data['slug'],
            UrgentNeed.id != need_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already exists")
    elif 'title' in update_data and not update_data.get('slug'):
        # Auto-generate slug from title if title changed but slug didn't
        update_data['slug'] = slugify(update_data['title'])
    
    for field, value in update_data.items():
        setattr(need, field, value)
    
    db.commit()
    db.refresh(need)
    return need


@router.delete("/{need_id}")
async def delete_urgent_need(
    need_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Delete an urgent need"""
    need = db.query(UrgentNeed).filter(UrgentNeed.id == need_id).first()
    if not need:
        raise HTTPException(status_code=404, detail="Urgent need not found")
    
    db.delete(need)
    db.commit()
    return {"message": "Urgent need deleted successfully"}

