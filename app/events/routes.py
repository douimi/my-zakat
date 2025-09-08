from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from werkzeug.utils import secure_filename
from datetime import datetime

from app.models import db, Donation, ContactSubmission, Event
from app.events import events_bp

from flask import current_app

import os



@events_bp.route("/event/<int:event_id>")
def event_details(event_id):
    event = Event.query.get_or_404(event_id)
    return render_template("events/event_details.html", event=event)



