"""
Campaigns router — homepage popup campaigns.

A campaign is shown as a centered popup on the homepage when it's active.
Only ONE campaign can be active at any time. Activating a campaign
automatically deactivates the previous one.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Campaign
from schemas import CampaignCreate, CampaignUpdate, CampaignResponse
from auth_utils import get_current_admin
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────
# Public endpoint — single active campaign for the popup
# ─────────────────────────────────────────────────────────────────────

@router.get("/active", response_model=Optional[CampaignResponse])
async def get_active_campaign(db: Session = Depends(get_db)):
    """Return the currently active campaign, or null if none is active."""
    return db.query(Campaign).filter(Campaign.is_active == True).first()  # noqa: E712


# ─────────────────────────────────────────────────────────────────────
# Admin endpoints
# ─────────────────────────────────────────────────────────────────────

def _deactivate_others(db: Session, except_id: Optional[int] = None) -> None:
    """Set is_active=False on every other campaign so only one stays active."""
    q = db.query(Campaign).filter(Campaign.is_active == True)  # noqa: E712
    if except_id is not None:
        q = q.filter(Campaign.id != except_id)
    touched = False
    for camp in q.all():
        camp.is_active = False
        camp.updated_at = datetime.utcnow()
        touched = True
    # Flush so the deactivation UPDATE is sent to the DB before any subsequent
    # INSERT/UPDATE that marks another row active — required for the partial
    # unique index (one row with is_active=TRUE) to be satisfied within one txn.
    if touched:
        db.flush()


@router.get("/", response_model=List[CampaignResponse])
async def list_campaigns(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    """List all campaigns (most recently updated first)."""
    return db.query(Campaign).order_by(Campaign.updated_at.desc()).all()


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return camp


@router.post("/", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    # If this campaign is being created as active, deactivate the others first
    if payload.is_active:
        _deactivate_others(db)

    camp = Campaign(**payload.dict())
    db.add(camp)
    db.commit()
    db.refresh(camp)

    logger.info(
        "Admin %s created campaign #%s ('%s'), active=%s",
        current_admin.email, camp.id, camp.title, camp.is_active,
    )
    return camp


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    data = payload.dict(exclude_unset=True)
    # If activating, deactivate others first
    if data.get("is_active") is True and not camp.is_active:
        _deactivate_others(db, except_id=campaign_id)

    for field, value in data.items():
        setattr(camp, field, value)
    camp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(camp)

    logger.info("Admin %s updated campaign #%s", current_admin.email, campaign_id)
    return camp


@router.post("/{campaign_id}/activate", response_model=CampaignResponse)
async def activate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    """Make this campaign the single active one (deactivates any other)."""
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _deactivate_others(db, except_id=campaign_id)
    camp.is_active = True
    camp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(camp)
    logger.info("Admin %s activated campaign #%s", current_admin.email, campaign_id)
    return camp


@router.post("/{campaign_id}/deactivate", response_model=CampaignResponse)
async def deactivate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    """Deactivate this campaign (no popup will be shown)."""
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    camp.is_active = False
    camp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(camp)
    logger.info("Admin %s deactivated campaign #%s", current_admin.email, campaign_id)
    return camp


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(camp)
    db.commit()
    logger.info("Admin %s deleted campaign #%s ('%s')", current_admin.email, campaign_id, camp.title)
    return {"message": "Campaign deleted"}
