from database import SessionLocal
from models import Admin, Setting
from auth_utils import get_password_hash

def init_default_data():
    """Initialize default admin user and settings"""
    db = SessionLocal()
    
    try:
        # Create default admin user if it doesn't exist
        admin = db.query(Admin).filter(Admin.username == 'admin').first()
        if not admin:
            admin = Admin(
                username='admin',
                password=get_password_hash('admin')
            )
            db.add(admin)
            print("✅ Default admin user created (admin/admin)")
        else:
            print("ℹ️  Admin user already exists")
        
        # Create default settings if they don't exist
        default_settings = [
            {
                'key': 'meals_provided',
                'value': '25000',
                'description': 'Total number of meals provided to families in need'
            },
            {
                'key': 'families_supported',
                'value': '1200',
                'description': 'Total number of families supported through our programs'
            },
            {
                'key': 'orphans_cared_for',
                'value': '800',
                'description': 'Total number of orphans receiving care and support'
            },
            {
                'key': 'total_raised',
                'value': '500000',
                'description': 'Total amount raised in USD for all programs'
            }
        ]
        
        for setting_data in default_settings:
            existing = db.query(Setting).filter(Setting.key == setting_data['key']).first()
            if not existing:
                setting = Setting(**setting_data)
                db.add(setting)
                print(f"✅ Default setting created: {setting_data['key']}")
            else:
                print(f"ℹ️  Setting already exists: {setting_data['key']}")
        
        db.commit()
        print("✅ Database initialization completed")
        
    except Exception as e:
        print(f"❌ Error initializing data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_default_data()
