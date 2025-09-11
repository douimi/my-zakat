from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import Admin, Setting
from auth_utils import get_password_hash
from routers import auth, admin, donations, events, stories, contact, testimonials, subscriptions, volunteers, settings

load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

def ensure_admin_user():
    """Ensure admin user exists as backup to SQL initialization"""
    db = next(get_db())
    try:
        # Check if admin user exists
        admin_user = db.query(Admin).filter(Admin.username == "admin").first()
        if not admin_user:
            print("🔧 Creating default admin user (admin/admin)...")
            hashed_password = get_password_hash("admin")
            admin_user = Admin(username="admin", password=hashed_password)
            db.add(admin_user)
            db.commit()
            print("✅ Admin user created successfully!")
        else:
            print("✅ Admin user already exists")
            # Verify the password hash is correct by updating it
            print("🔧 Updating admin password hash to ensure compatibility...")
            admin_user.password = get_password_hash("admin")
            db.commit()
            print("✅ Admin password hash updated!")
            
        # Ensure default settings exist
        default_settings = [
            ('meals_provided', '25000', 'Total number of meals provided to families in need'),
            ('families_supported', '1200', 'Total number of families supported through our programs'),
            ('orphans_cared_for', '800', 'Total number of orphans receiving care and support'),
            ('total_raised', '500000', 'Total amount raised in USD for all programs'),
            ('hero_video', '', 'Main video displayed on the homepage hero section'),
            ('program_image_1', '', 'First program image on homepage'),
            ('program_image_2', '', 'Second program image on homepage'),
            ('program_image_3', '', 'Third program image on homepage'),
            ('gallery_item_1', '', 'Gallery image/video 1'),
            ('gallery_item_2', '', 'Gallery image/video 2'),
            ('gallery_item_3', '', 'Gallery image/video 3'),
            ('gallery_item_4', '', 'Gallery image/video 4'),
            ('gallery_item_5', '', 'Gallery image/video 5'),
            ('gallery_item_6', '', 'Gallery image/video 6'),
        ]
        
        for key, value, description in default_settings:
            setting = db.query(Setting).filter(Setting.key == key).first()
            if not setting:
                setting = Setting(key=key, value=value, description=description)
                db.add(setting)
        
        db.commit()
        print("✅ Default settings ensured")
        
    except Exception as e:
        print(f"❌ Error ensuring admin user: {e}")
        db.rollback()
    finally:
        db.close()

# Ensure admin user exists on startup
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
        "uploads/testimonials"
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        print(f"✅ Directory ensured: {directory}")

ensure_media_directories()

app = FastAPI(
    title="MyZakat API",
    description="Professional donation platform API",
    version="1.0.0"
)

# CORS middleware - Allow both local development and production
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(donations.router, prefix="/api/donations", tags=["donations"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(stories.router, prefix="/api/stories", tags=["stories"])
app.include_router(contact.router, prefix="/api/contact", tags=["contact"])
app.include_router(testimonials.router, prefix="/api/testimonials", tags=["testimonials"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(volunteers.router, prefix="/api/volunteers", tags=["volunteers"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])

@app.get("/")
async def root():
    return {"message": "MyZakat API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
