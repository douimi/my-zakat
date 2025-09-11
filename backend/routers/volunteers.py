from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Volunteer
from schemas import VolunteerCreate, VolunteerResponse
from auth_utils import get_current_admin

router = APIRouter()


@router.post("/", response_model=VolunteerResponse)
async def create_volunteer(volunteer: VolunteerCreate, db: Session = Depends(get_db)):
    db_volunteer = Volunteer(**volunteer.dict())
    db.add(db_volunteer)
    db.commit()
    db.refresh(db_volunteer)
    return db_volunteer


@router.get("/", response_model=List[VolunteerResponse])
async def get_volunteers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    volunteers = db.query(Volunteer).offset(skip).limit(limit).all()
    return volunteers


@router.delete("/{volunteer_id}")
async def delete_volunteer(
    volunteer_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    volunteer = db.query(Volunteer).filter(Volunteer.id == volunteer_id).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    
    db.delete(volunteer)
    db.commit()
    return {"message": "Volunteer deleted"}
