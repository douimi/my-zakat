from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# User schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

# Contact schemas
class ContactCreate(BaseModel):
    name: str
    email: EmailStr
    message: str

class ContactResponse(BaseModel):
    id: int
    name: str
    email: str
    message: str
    submitted_at: datetime
    resolved: bool
    
    class Config:
        from_attributes = True

class ContactReply(BaseModel):
    message: str

# Story schemas
class StoryCreate(BaseModel):
    title: str
    summary: str
    content: str
    image_filename: Optional[str] = None
    video_filename: Optional[str] = None
    is_active: bool = True
    is_featured: bool = False

class StoryResponse(BaseModel):
    id: int
    title: str
    summary: str
    content: str
    image_filename: Optional[str]
    video_filename: Optional[str]
    is_active: bool
    is_featured: bool
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Testimonial schemas
class TestimonialCreate(BaseModel):
    name: str
    country: Optional[str] = ""
    text: str
    rating: int = 5
    category: Optional[str] = "donor"
    is_approved: bool = False
    image: Optional[str] = None
    video_filename: Optional[str] = None

class TestimonialResponse(BaseModel):
    id: int
    name: str
    country: Optional[str]
    text: str
    rating: Optional[int]
    category: Optional[str]
    image: Optional[str]
    video_filename: Optional[str]
    is_approved: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Event schemas
class EventCreate(BaseModel):
    title: str
    description: str
    date: str
    location: str
    image: Optional[str] = None

class EventResponse(BaseModel):
    id: int
    title: str
    description: str
    date: datetime
    location: str
    image: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Volunteer schemas
class VolunteerCreate(BaseModel):
    name: str
    email: EmailStr
    interest: str
    phone: Optional[str] = None  # Optional field, not stored in model
    message: Optional[str] = None  # Optional field, not stored in model

class VolunteerResponse(BaseModel):
    id: int
    name: str
    email: str
    interest: str
    submitted_at: datetime
    
    class Config:
        from_attributes = True

# Setting schemas
class SettingCreate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class SettingUpdate(BaseModel):
    value: Optional[str] = None
    description: Optional[str] = None

class SettingResponse(BaseModel):
    id: int
    key: str
    value: str
    description: Optional[str]
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Slideshow schemas
class SlideshowSlideCreate(BaseModel):
    title: str
    description: Optional[str] = None
    image_filename: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True

class SlideshowSlideUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image_filename: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class SlideshowSlideResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    image_filename: Optional[str]
    image_url: Optional[str]
    cta_text: Optional[str]
    cta_url: Optional[str]
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Urgent Need schemas
class UrgentNeedCreate(BaseModel):
    title: str
    slug: str
    short_description: Optional[str] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    js_content: Optional[str] = None
    image_url: Optional[str] = None
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True

class UrgentNeedUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    short_description: Optional[str] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None
    js_content: Optional[str] = None
    image_url: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class UrgentNeedResponse(BaseModel):
    id: int
    title: str
    slug: str
    short_description: Optional[str]
    html_content: Optional[str]
    css_content: Optional[str]
    js_content: Optional[str]
    image_url: Optional[str]
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Donation schemas
class DonationCreate(BaseModel):
    name: str
    email: EmailStr
    amount: float
    frequency: str

class DonationResponse(BaseModel):
    id: int
    name: str
    email: str
    amount: float
    frequency: str
    stripe_session_id: Optional[str]
    certificate_filename: Optional[str]
    donated_at: datetime
    
    class Config:
        from_attributes = True

class PaymentCreate(BaseModel):
    amount: float
    name: str
    email: EmailStr
    purpose: Optional[str] = None
    frequency: str

class PaymentSession(BaseModel):
    id: str

class ZakatCalculation(BaseModel):
    gold_value: Optional[float] = None
    silver_value: Optional[float] = None
    cash: Optional[float] = None
    business_assets: Optional[float] = None
    other_assets: Optional[float] = None

class ZakatResult(BaseModel):
    total_zakat: float
    breakdown: dict

class SubscriptionCreate(BaseModel):
    name: str
    email: EmailStr
    amount: float
    purpose: Optional[str] = None
    interval: str
    payment_day: int
    payment_month: Optional[int] = None

class SubscriptionSession(BaseModel):
    id: str

class SubscriptionResponse(BaseModel):
    id: int
    name: str
    email: str
    amount: float
    frequency: str
    stripe_subscription_id: str
    stripe_customer_id: str
    stripe_session_id: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    next_payment_date: Optional[datetime]
    
    class Config:
        from_attributes = True

# Gallery Item schemas
class GalleryItemCreate(BaseModel):
    media_filename: str
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True

class GalleryItemUpdate(BaseModel):
    media_filename: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class GalleryItemResponse(BaseModel):
    id: int
    media_filename: str
    display_order: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
