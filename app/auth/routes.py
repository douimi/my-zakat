from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required

from app import db
from app.models import Admin, User
from . import auth_bp  # ✅ import your Blueprint object here

# Login Route
@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        admin = Admin.query.filter_by(username=username).first()

        if admin and admin.check_password(password):
            user = User(id=admin.id, username=admin.username)
            login_user(user)
           # flash("Login successful.", "success")
            return redirect(url_for("admin.admin_dashboard"))  # ✅ redirect after login
        else:
            error = "Invalid username or password."
            return render_template("auth/login.html", error=error)

    return render_template("auth/login.html")

# Logout Route
@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
   # flash("You have been logged out.", "info")
    return redirect(url_for("main.home"))
