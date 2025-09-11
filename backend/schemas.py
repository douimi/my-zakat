from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime


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


# Donation schemas
class DonationCreate(BaseModel):
    name: str
    email: EmailStr
    amount: float
    frequency: str = "One-Time"

    @validator('amount')
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return v


class DonationResponse(BaseModel):
    id: int
    name: str
    email: str
    amount: float
    frequency: str
    donated_at: datetime

    class Config:
        from_attributes = True


# Event schemas
class EventCreate(BaseModel):
    title: str
    description: str
    date: datetime
    location: str
    image: Optional[str] = None


class EventResponse(BaseModel):
    id: int
    title: str
    description: str
    date: datetime
    location: str
    image: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Story schemas
class StoryCreate(BaseModel):
    title: str
    summary: str
    content: str
    image_filename: Optional[str] = None
    video_url: Optional[str] = None
    is_active: bool = True
    is_featured: bool = False


class StoryResponse(BaseModel):
    id: int
    title: str
    summary: str
    content: str
    image_filename: Optional[str] = None
    video_url: Optional[str] = None
    is_active: bool
    is_featured: bool

    class Config:
        from_attributes = True


# Volunteer schemas
class VolunteerCreate(BaseModel):
    name: str
    email: EmailStr
    interest: str


class VolunteerResponse(BaseModel):
    id: int
    name: str
    email: str
    interest: str
    submitted_at: datetime

    class Config:
        from_attributes = True


# Testimonial schemas
class TestimonialCreate(BaseModel):
    name: str
    country: Optional[str] = None
    image: Optional[str] = None
    text: str
    rating: Optional[int] = None
    video_url: Optional[str] = None
    category: Optional[str] = None

    @validator('rating')
    def rating_must_be_valid(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError('Rating must be between 1 and 5')
        return v


class TestimonialResponse(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    image: Optional[str] = None
    text: str
    rating: Optional[int] = None
    video_url: Optional[str] = None
    category: Optional[str] = None
    created_at: datetime
    is_approved: bool

    class Config:
        from_attributes = True


# Subscription schemas
class SubscriptionCreate(BaseModel):
    name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    wants_email: bool = True
    wants_sms: bool = False


class SubscriptionResponse(BaseModel):
    id: int
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    wants_email: bool
    wants_sms: bool
    subscribed_at: datetime

    class Config:
        from_attributes = True


# Auth schemas
class AdminLogin(BaseModel):
    username: str
    password: str


class AdminResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# Zakat Calculator schemas
class ZakatCalculation(BaseModel):
    liabilities: float = 0
    cash: float = 0
    receivables: float = 0
    stocks: float = 0
    retirement: float = 0
    gold_weight: float = 0
    gold_price_per_gram: float = 0
    silver_weight: float = 0
    silver_price_per_gram: float = 0
    business_goods: float = 0
    agriculture_value: float = 0
    investment_property: float = 0
    other_valuables: float = 0
    livestock: float = 0
    other_assets: float = 0


class ZakatResult(BaseModel):
    wealth: float
    gold: float
    silver: float
    business_goods: float
    agriculture: float
    total: float


# Stripe payment schemas
class PaymentCreate(BaseModel):
    amount: float
    name: str
    email: EmailStr
    purpose: str = "Donation"
    frequency: str = "One-Time"


class PaymentSession(BaseModel):
    id: str


# Settings schemas
class SettingCreate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class SettingUpdate(BaseModel):
    value: str
    description: Optional[str] = None


class SettingResponse(BaseModel):
    id: int
    key: str
    value: str
    description: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True
