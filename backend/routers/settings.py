from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Setting
from schemas import SettingCreate, SettingUpdate, SettingResponse
from auth_utils import get_current_admin

router = APIRouter()


@router.get("/", response_model=List[SettingResponse])
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Setting).all()
    return settings


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(key: str, db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.post("/", response_model=SettingResponse)
async def create_setting(
    setting: SettingCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    # Check if setting already exists
    existing = db.query(Setting).filter(Setting.key == setting.key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Setting already exists")
    
    db_setting = Setting(**setting.dict())
    db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    return db_setting


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    setting_update: SettingUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    setting = db.query(Setting).filter(Setting.key == key).first()
    
    # If setting doesn't exist, create it
    if not setting:
        setting_data = setting_update.dict(exclude_unset=True)
        setting_data['key'] = key
        # Set default description if not provided
        if 'description' not in setting_data or not setting_data['description']:
            setting_data['description'] = f"Setting for {key}"
        setting = Setting(**setting_data)
        db.add(setting)
    else:
        # Update existing setting
        for field, value in setting_update.dict(exclude_unset=True).items():
            setattr(setting, field, value)
    
    db.commit()
    db.refresh(setting)
    return setting


@router.delete("/{key}")
async def delete_setting(
    key: str,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    db.delete(setting)
    db.commit()
    return {"message": "Setting deleted"}


@router.get("/public/impact-stats")
async def get_impact_stats(db: Session = Depends(get_db)):
    """Public endpoint to get impact statistics for the homepage"""
    settings = db.query(Setting).filter(Setting.key.in_([
        'meals_provided',
        'families_supported', 
        'orphans_cared_for',
        'total_raised'
    ])).all()
    
    # Convert to dict for easy access
    settings_dict = {s.key: s.value for s in settings}
    
    return {
        "meals": int(settings_dict.get('meals_provided', '0')),
        "families": int(settings_dict.get('families_supported', '0')),
        "orphans": int(settings_dict.get('orphans_cared_for', '0')),
        "total_raised": float(settings_dict.get('total_raised', '0'))
    }
