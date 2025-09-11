from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from database import get_db
from models import Admin
from schemas import AdminLogin, Token, AdminResponse
from auth_utils import verify_password, create_access_token, get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(admin_login: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == admin_login.username).first()
    
    if not admin or not verify_password(admin_login.password, admin.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/create-admin")
async def create_admin(username: str, password: str, db: Session = Depends(get_db)):
    # Check if admin already exists
    existing_admin = db.query(Admin).filter(Admin.username == username).first()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin already exists"
        )
    
    hashed_password = get_password_hash(password)
    admin = Admin(username=username, password=hashed_password)
    
    db.add(admin)
    db.commit()
    db.refresh(admin)
    
    return {"message": "Admin created successfully"}
