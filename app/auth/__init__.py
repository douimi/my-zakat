# app/auth/__init__.py
from flask import Blueprint

auth_bp = Blueprint("auth", __name__, template_folder="../templates")

from app.auth import routes  # make sure this import works



