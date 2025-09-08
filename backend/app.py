import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_mail import Mail
from flask_jwt_extended import JWTManager
from config import config

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
mail = Mail()
jwt = JWTManager()

def create_app(config_name=None):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Load configuration
    config_name = config_name or os.environ.get('FLASK_ENV', 'production')
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    mail.init_app(app)
    jwt.init_app(app)
    
    # Configure CORS
    CORS(app, 
         origins=app.config['CORS_ORIGINS'],
         supports_credentials=True,
         allow_headers=['Content-Type', 'Authorization'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
    
    # Initialize database
    with app.app_context():
        try:
            # Create instance directory if it doesn't exist
            instance_dir = os.path.join(os.path.dirname(__file__), 'instance')
            if not os.path.exists(instance_dir):
                os.makedirs(instance_dir)
                print(f"Created instance directory: {instance_dir}")
            
            # Import models to ensure they're registered
            from models import (Admin, ContactSubmission, Donation, Story, 
                              Event, Testimonial, Volunteer, Subscription)
            
            # Create all database tables
            db.create_all()
            print("✅ Database tables created/verified")
            
            # Create default admin user if it doesn't exist
            from werkzeug.security import generate_password_hash
            existing_admin = Admin.query.filter_by(username='admin').first()
            if not existing_admin:
                admin_user = Admin(
                    username='admin',
                    email='admin@myzakat.org',
                    password=generate_password_hash('admin'),
                    is_active=True
                )
                db.session.add(admin_user)
                db.session.commit()
                print("✅ Default admin user created (admin/admin)")
            
        except Exception as e:
            print(f"⚠️  Database initialization warning: {str(e)}")
    
    # Register blueprints
    from api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    
    # Health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'service': 'myzakat-api'}, 200
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000)
