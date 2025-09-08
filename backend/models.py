from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from app import db

class ContactSubmission(db.Model):
    __tablename__ = 'contact_submission'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'message': self.message,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'resolved': self.resolved
        }

class Donation(db.Model):
    __tablename__ = 'donation'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    frequency = db.Column(db.String(50), nullable=False)
    donated_at = db.Column(db.DateTime, default=datetime.utcnow)
    stripe_payment_id = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(50), default='completed')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'amount': self.amount,
            'frequency': self.frequency,
            'donated_at': self.donated_at.isoformat() if self.donated_at else None,
            'status': self.status
        }

class Admin(db.Model):
    __tablename__ = 'admin'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), nullable=False, unique=True)
    email = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(200), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    
    def set_password(self, password):
        self.password = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

class Event(db.Model):
    __tablename__ = 'event'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    date = db.Column(db.DateTime, nullable=False)
    location = db.Column(db.String(255), nullable=False)
    image = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_featured = db.Column(db.Boolean, default=False)
    max_attendees = db.Column(db.Integer, nullable=True)
    registration_deadline = db.Column(db.DateTime, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'date': self.date.isoformat() if self.date else None,
            'location': self.location,
            'image': self.image,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_featured': self.is_featured,
            'max_attendees': self.max_attendees,
            'registration_deadline': self.registration_deadline.isoformat() if self.registration_deadline else None
        }

class Volunteer(db.Model):
    __tablename__ = 'volunteer'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30), nullable=True)
    interest = db.Column(db.String(100), nullable=False)
    skills = db.Column(db.Text, nullable=True)
    availability = db.Column(db.String(255), nullable=True)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(50), default='pending')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'interest': self.interest,
            'skills': self.skills,
            'availability': self.availability,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'status': self.status
        }

class Story(db.Model):
    __tablename__ = 'story'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    content = db.Column(db.Text, nullable=False)
    image_filename = db.Column(db.String(200))
    video_url = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True)
    is_featured = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    view_count = db.Column(db.Integer, default=0)
    category = db.Column(db.String(50), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'summary': self.summary,
            'content': self.content,
            'image_filename': self.image_filename,
            'video_url': self.video_url,
            'is_active': self.is_active,
            'is_featured': self.is_featured,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'view_count': self.view_count,
            'category': self.category
        }

class PressRelease(db.Model):
    __tablename__ = 'press_release'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    content = db.Column(db.Text, nullable=False)
    image_filename = db.Column(db.String(100), nullable=True)
    date_posted = db.Column(db.DateTime, default=datetime.utcnow)
    external_link = db.Column(db.String(500), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'summary': self.summary,
            'content': self.content,
            'image_filename': self.image_filename,
            'date_posted': self.date_posted.isoformat() if self.date_posted else None,
            'external_link': self.external_link
        }

class Testimonial(db.Model):
    __tablename__ = 'testimonial'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    country = db.Column(db.String(100), nullable=True)
    image = db.Column(db.String(255), nullable=True)
    text = db.Column(db.Text, nullable=False)
    rating = db.Column(db.Integer, nullable=True)
    video_url = db.Column(db.String(255), nullable=True)
    category = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_approved = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'country': self.country,
            'image': self.image,
            'text': self.text,
            'rating': self.rating,
            'video_url': self.video_url,
            'category': self.category,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_approved': self.is_approved
        }

class Subscription(db.Model):
    __tablename__ = 'subscription'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=True)
    email = db.Column(db.String(100), nullable=False, unique=True)
    phone = db.Column(db.String(30), nullable=True)
    wants_email = db.Column(db.Boolean, default=True)
    wants_sms = db.Column(db.Boolean, default=False)
    subscribed_at = db.Column(db.DateTime, default=datetime.utcnow)
    unsubscribed_at = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'wants_email': self.wants_email,
            'wants_sms': self.wants_sms,
            'subscribed_at': self.subscribed_at.isoformat() if self.subscribed_at else None,
            'is_active': self.is_active
        }
