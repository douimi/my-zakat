from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail
from flask_migrate import Migrate

# Initialize extensions (do not bind to app yet)
db = SQLAlchemy()
mail = Mail()
migrate = Migrate()
login_manager = LoginManager()


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object("config.Config")  # Load configuration

    # Initialize extensions with app
    db.init_app(app)
    mail.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    
    @login_manager.user_loader
    def load_user(user_id):
        from app.models import Admin, User
        admin = Admin.query.get(int(user_id))
        if admin:
           return User(id=admin.id, username=admin.username)
        return None


    # Register blueprints
    from app.main import main_bp
    from app.auth import auth_bp
    from app.events import events_bp
    from app.admin import admin_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(events_bp, url_prefix="/events")


    return app
