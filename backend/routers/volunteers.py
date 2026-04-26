from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Volunteer
from schemas import VolunteerCreate, VolunteerResponse
from auth_utils import get_current_admin
from email_service import (
    send_volunteer_admin_notification,
    send_volunteer_acknowledgement,
)
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/", response_model=VolunteerResponse)
async def create_volunteer(
    volunteer: VolunteerCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Only include fields that exist in the Volunteer model (exclude phone and message)
    db_volunteer = Volunteer(
        name=volunteer.name,
        email=volunteer.email,
        interest=volunteer.interest
    )
    db.add(db_volunteer)
    db.commit()
    db.refresh(db_volunteer)

    # Send notifications in the background
    background_tasks.add_task(
        send_volunteer_admin_notification,
        name=volunteer.name,
        email=volunteer.email,
        interest=volunteer.interest,
        phone=volunteer.phone,
        message=volunteer.message,
    )
    background_tasks.add_task(
        send_volunteer_acknowledgement,
        name=volunteer.name,
        email=volunteer.email,
        interest=volunteer.interest,
    )
    logger.info("Volunteer signup from %s — notifications queued", volunteer.email)

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
