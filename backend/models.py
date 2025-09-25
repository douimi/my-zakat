from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean
from sqlalchemy.sql import func
from database import Base
from datetime import datetime


class ContactSubmission(Base):
    __tablename__ = "contact_submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    resolved = Column(Boolean, default=False)


class Donation(Base):
    __tablename__ = "donations"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    frequency = Column(String(50), nullable=False)
    stripe_session_id = Column(String(255), nullable=True)  # Track Stripe session for updates
    donated_at = Column(DateTime, default=datetime.utcnow)


class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(String(200), nullable=False)


class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    date = Column(DateTime, nullable=False)
    location = Column(String(255), nullable=False)
    image = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Volunteer(Base):
    __tablename__ = "volunteers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    interest = Column(String(100), nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)


class Story(Base):
    __tablename__ = "stories"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    image_filename = Column(String(200))
    video_url = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_featured = Column(Boolean, default=False)


class PressRelease(Base):
    __tablename__ = "press_releases"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    image_filename = Column(String(100), nullable=True)
    date_posted = Column(DateTime, default=datetime.utcnow)


class Testimonial(Base):
    __tablename__ = "testimonials"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    country = Column(String(100), nullable=True)
    image = Column(String(255), nullable=True)
    text = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)
    video_url = Column(String(255), nullable=True)
    category = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_approved = Column(Boolean, default=False)


class Subscription(Base):
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    email = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True)
    wants_email = Column(Boolean, default=True)
    wants_sms = Column(Boolean, default=False)
    subscribed_at = Column(DateTime, default=datetime.utcnow)


class DonationSubscription(Base):
    __tablename__ = "donation_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=False)
    stripe_customer_id = Column(String(255), nullable=False)
    stripe_session_id = Column(String(255), nullable=True)  # Track Stripe session for updates
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    purpose = Column(String(100), nullable=False)
    interval = Column(String(20), nullable=False)  # "month" or "year"
    payment_day = Column(Integer, nullable=False)  # Day of month (1-31)
    payment_month = Column(Integer, nullable=True)  # Month for annual (1-12)
    status = Column(String(50), default="active")  # active, canceled, past_due
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    next_payment_date = Column(DateTime, nullable=True)


class Setting(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(String(500), nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
