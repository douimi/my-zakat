import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-secret-key")

    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'contacts.db')}"

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Upload settings
    UPLOAD_FOLDER = os.path.join(
        os.path.abspath(os.path.dirname(__file__)), "app", "static", "images", "events"
    )
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}

    # Mail settings
    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", MAIL_USERNAME)

    # Cost settings
    MEAL_COST = 5
    FAMILY_COST = 100
    ORPHAN_COST = 100


# Print the DB URI for debugging
print("DB URI:", Config.SQLALCHEMY_DATABASE_URI)
