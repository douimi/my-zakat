from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import User, Setting
from auth_utils import get_password_hash
from s3_service import ensure_bucket_exists
from routers import auth, admin, donations, events, stories, contact, testimonials, subscriptions, volunteers, settings, user, slideshow, urgent_needs, media, static_files, gallery, program_categories, programs

load_dotenv()

# Check if running in test mode
TESTING_MODE = os.getenv("TESTING", "false").lower() == "true"

# Create database tables only if not in test mode
if not TESTING_MODE:
    Base.metadata.create_all(bind=engine)

def ensure_admin_user():
    """Ensure at least one admin user exists"""
    db = next(get_db())
    try:
        # Check if any admin user exists
        admin_user = db.query(User).filter(User.is_admin == True).first()
        if not admin_user:
            # Creating default admin user
            hashed_password = get_password_hash("admin123")
            admin_user = User(
                email="admin@example.com",
                password=hashed_password,
                name="Super Admin",
                is_active=True,
                is_admin=True,
                email_verified=True  # Admin users don't need email verification
            )
            db.add(admin_user)
            db.commit()
            pass  # Admin user created successfully
        else:
            pass  # Admin user exists
            
        # Ensure default settings exist
        default_settings = [
            ('meals_provided', '25000', 'Total number of meals provided to families in need'),
            ('families_supported', '1200', 'Total number of families supported through our programs'),
            ('orphans_cared_for', '800', 'Total number of orphans receiving care and support'),
            ('total_raised', '500000', 'Total amount raised in USD for all programs'),
            ('hero_video', '', 'Main video displayed on the homepage hero section'),
            ('gallery_item_1', '', 'Gallery image/video 1'),
            ('gallery_item_2', '', 'Gallery image/video 2'),
            ('gallery_item_3', '', 'Gallery image/video 3'),
            ('gallery_item_4', '', 'Gallery image/video 4'),
            ('gallery_item_5', '', 'Gallery image/video 5'),
            ('gallery_item_6', '', 'Gallery image/video 6'),
            ('sticky_donation_bar_enabled', 'false', 'Enable or disable the sticky donation bar on the homepage'),
        ]
        
        for key, value, description in default_settings:
            setting = db.query(Setting).filter(Setting.key == key).first()
            if not setting:
                setting = Setting(key=key, value=value, description=description)
                db.add(setting)
        
        db.commit()
        # Default settings ensured
        
    except Exception as e:
        print(f"❌ Error ensuring admin user: {e}")
        db.rollback()
    finally:
        db.close()

# Ensure admin user exists on startup (skip in test mode)
if not TESTING_MODE:
    ensure_admin_user()

# Ensure media directories exist
def ensure_media_directories():
    """Ensure media upload directories exist"""
    import os
    directories = [
        "uploads/media/videos",
        "uploads/media/images",
        "uploads/events",
        "uploads/stories",
        "uploads/testimonials",
        "uploads/program_categories",
        "uploads/programs"
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        # Directory ensured
    
    # Ensure video upload directory
    video_dir = "uploads/media/videos"
    if not os.path.exists(video_dir):
        os.makedirs(video_dir, exist_ok=True)

# Ensure media directories (skip in test mode)
if not TESTING_MODE:
    ensure_media_directories()
    # Initialize S3 bucket
    try:
        ensure_bucket_exists()
        print("✅ S3 bucket initialized successfully")
    except Exception as e:
        print(f"⚠️  Warning: Could not initialize S3 bucket: {e}")
        print("   File uploads will fall back to local storage")

app = FastAPI(
    title="MyZakat API",
    description="Professional donation platform API",
    version="1.0.0"
)

# CORS middleware - Allow both local development and production
# For production deployment, we need to be more permissive to allow mobile access
allowed_origins = [
    "http://localhost:3000",  # Local React dev
    "http://localhost:5173",  # Local Vite dev
    "http://38.242.253.204:3000",  # Your VPS frontend
    "https://38.242.253.204:3000",  # HTTPS version if needed
]

# Add custom domain if environment variable is set
custom_origin = os.getenv("FRONTEND_URL")
if custom_origin:
    allowed_origins.append(custom_origin)

# Check if we're in production mode (based on environment)
is_production = os.getenv("ENVIRONMENT", "development") == "production"

if is_production:
    # In production, allow all origins to support mobile devices and different network contexts
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for production
        allow_credentials=False,  # Must be False when allow_origins=["*"]
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # In development, use specific origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Use router for all static file serving (videos with range support, images, etc.)
# This ensures proper video streaming with range request support
app.include_router(static_files.router, prefix="/api/uploads", tags=["static-files"])

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(user.router, prefix="/api/user", tags=["user"])
app.include_router(donations.router, prefix="/api/donations", tags=["donations"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
app.include_router(stories.router, prefix="/api/stories", tags=["stories"])
app.include_router(contact.router, prefix="/api/contact", tags=["contact"])
app.include_router(testimonials.router, prefix="/api/testimonials", tags=["testimonials"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(volunteers.router, prefix="/api/volunteers", tags=["volunteers"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(slideshow.router, prefix="/api/slideshow", tags=["slideshow"])
app.include_router(urgent_needs.router, prefix="/api/urgent-needs", tags=["urgent-needs"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["gallery"])
app.include_router(program_categories.router, prefix="/api/program-categories", tags=["program-categories"])
app.include_router(programs.router, prefix="/api/programs", tags=["programs"])

@app.get("/")
async def root():
    return {"message": "MyZakat API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
