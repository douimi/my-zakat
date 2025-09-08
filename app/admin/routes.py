from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    Response,
    current_app,
)
from flask_login import login_required
from werkzeug.utils import secure_filename
from app.models import (
    ContactSubmission,
    Donation,
    Event,
    Volunteer,
    Story,
    Subscription,
)
from app import db, mail
from datetime import datetime
import csv
import io
import os
from flask_mail import Message

admin_bp = Blueprint("admin", __name__)


def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in current_app.config["ALLOWED_EXTENSIONS"]
    )


# 📅 Admin Manage Events
@admin_bp.route("/admin/events")
@login_required
def admin_events():
    events = Event.query.order_by(Event.date.desc()).all()
    return render_template("admin/admin_events.html", events=events)


# 📅 Add Event
@admin_bp.route("/admin/events/add", methods=["GET", "POST"])
@login_required
def add_event():
    if request.method == "POST":
        title = request.form.get("title")
        description = request.form.get("description")
        date_str = request.form.get("date")
        location = request.form.get("location")
        image_file = request.files.get("image")

        if not title or not description or not date_str or not location:
            flash("All fields are required!", "error")
            return redirect(url_for("admin.add_event"))

        try:
            date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            flash("Invalid date format. Please use YYYY-MM-DD.", "error")
            return redirect(url_for("admin.add_event"))

        filename = None

        if image_file and image_file.filename:
            filename = secure_filename(image_file.filename)
            image_folder = os.path.join(
                current_app.root_path, "static", "images", "events"
            )
            os.makedirs(image_folder, exist_ok=True)  # ✅ Ensure folder exists
            image_path = os.path.join(image_folder, filename)

            image_file.save(image_path)

        # new_event = Event(title=title, description=description, date=date, location=location, image=image_path)
        new_event = Event(
            title=title,
            description=description,
            date=date,
            location=location,
            image=filename,
        )

        db.session.add(new_event)
        db.session.commit()

        flash("Event added successfully!", "success")
        return redirect(url_for("admin.admin_events"))

    return render_template("admin/event_submission.html")


# 📅 Edit Event
@admin_bp.route("/admin/events/edit/<int:event_id>", methods=["GET", "POST"])
@login_required
def edit_event(event_id):
    event = Event.query.get_or_404(event_id)

    if request.method == "POST":
        event.title = request.form.get("title")
        event.description = request.form.get("description")
        event.date = datetime.strptime(request.form.get("date"), "%Y-%m-%d")
        event.location = request.form.get("location")

        image_file = request.files.get("image")

        if image_file and image_file.filename:
            filename = secure_filename(image_file.filename)
            image_folder = os.path.join(
                current_app.root_path, "static", "images", "events"
            )
            os.makedirs(image_folder, exist_ok=True)  # ✅ Ensure folder exists
            image_path = os.path.join(image_folder, filename)

            image_file.save(image_path)
            event.image = filename

        db.session.commit()
        flash("Event updated successfully!", "success")
        return redirect(url_for("admin.admin_events"))

    return render_template("events/edit_event.html", event=event)


# 📅 Delete Event
@admin_bp.route("/admin/events/delete/<int:event_id>")
@login_required
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    flash("Event deleted successfully!", "success")
    return redirect(url_for("admin.admin_events"))


# 🙌 Admin Manage Volunteers
@admin_bp.route("/admin/volunteers")
@login_required
def admin_volunteers():
    query = request.args.get("query", "")
    interest = request.args.get("interest", "")
    page = request.args.get("page", 1, type=int)

    volunteers_query = Volunteer.query

    if query:
        volunteers_query = volunteers_query.filter(
            (Volunteer.name.contains(query)) | (Volunteer.email.contains(query))
        )

    if interest:
        volunteers_query = volunteers_query.filter(Volunteer.interest == interest)

    volunteers = volunteers_query.order_by(Volunteer.submitted_at.desc()).paginate(
        page=page, per_page=10
    )

    return render_template("admin/admin_volunteers.html", volunteers=volunteers)


# 🙌 Admin Delete Volunteer
@admin_bp.route("/admin/volunteers/delete/<int:volunteer_id>", methods=["POST"])
@login_required
def delete_volunteer(volunteer_id):
    volunteer = Volunteer.query.get_or_404(volunteer_id)
    db.session.delete(volunteer)
    db.session.commit()
    flash("Volunteer entry deleted successfully.", "success")
    return redirect(url_for("admin.admin_volunteers"))


@admin_bp.route("/contacts")
def manage_contacts():
    query = request.args.get("query", "")
    filter_status = request.args.get("filter", "")

    contacts_query = ContactSubmission.query

    # Apply search query
    if query:
        contacts_query = contacts_query.filter(
            (ContactSubmission.name.ilike(f"%{query}%"))
            | (ContactSubmission.email.ilike(f"%{query}%"))
            | (ContactSubmission.subject.ilike(f"%{query}%"))
            | (ContactSubmission.message.ilike(f"%{query}%"))
        )

    # Apply resolved/unresolved filter
    if filter_status == "pending":
        contacts_query = contacts_query.filter_by(resolved=False)
    elif filter_status == "resolved":
        contacts_query = contacts_query.filter_by(resolved=True)

    contacts = contacts_query.order_by(ContactSubmission.id.desc()).all()

    return render_template("admin/admin_contacts.html", contacts=contacts)


@admin_bp.route("/admin")
@login_required
def admin_dashboard():
    # Retrieve query parameters
    query = request.args.get("query", "")
    filter_status = request.args.get("filter", "")
    donation_filter = request.args.get("donation_filter", "")
    page = request.args.get("page", 1, type=int)
    per_page = 10
    donation_page = request.args.get("donation_page", 1, type=int)

    # Contact submissions query
    submissions_query = ContactSubmission.query
    if query:
        submissions_query = submissions_query.filter(
            ContactSubmission.name.contains(query)
            | ContactSubmission.email.contains(query)
            | ContactSubmission.message.contains(query)
        )
    if filter_status == "pending":
        submissions_query = submissions_query.filter_by(resolved=False)
    elif filter_status == "resolved":
        submissions_query = submissions_query.filter_by(resolved=True)
    submissions = submissions_query.order_by(
        ContactSubmission.submitted_at.desc()
    ).paginate(page=page, per_page=per_page)

    # Donations query
    donations_query = Donation.query
    if donation_filter:
        donations_query = donations_query.filter(Donation.frequency == donation_filter)
    donations = donations_query.order_by(Donation.donated_at.desc()).paginate(
        page=donation_page, per_page=per_page
    )

    # Calculate statistics
    total_donations = db.session.query(db.func.sum(Donation.amount)).scalar() or 0
    total_donors = db.session.query(Donation.email).distinct().count()
    top_donor = Donation.query.order_by(Donation.amount.desc()).first()

    total_messages = ContactSubmission.query.count()
    total_unique_contacts = db.session.query(ContactSubmission.email).distinct().count()
    pending_contacts_count = ContactSubmission.query.filter_by(resolved=False).count()
    resolved_contacts_count = ContactSubmission.query.filter_by(resolved=True).count()

    total_volunteers = Volunteer.query.count()
    volunteers_by_interest = dict(
        db.session.query(Volunteer.interest, db.func.count(Volunteer.id))
        .group_by(Volunteer.interest)
        .all()
    )

    events = Event.query.order_by(Event.date.desc()).all()

    # Render the dashboard template with all statistics
    return render_template(
        "admin/admin_dashboard.html",
        submissions=submissions,
        donations=donations,
        total_donations=total_donations,
        total_donors=total_donors,
        top_donor=top_donor,
        total_messages=total_messages,
        total_unique_contacts=total_unique_contacts,
        pending_contacts_count=pending_contacts_count,
        resolved_contacts_count=resolved_contacts_count,
        total_volunteers=total_volunteers,
        volunteers_by_interest=volunteers_by_interest,
        events=events,
    )


@admin_bp.route("/resolve-submission/<int:submission_id>")
@login_required
def resolve_submission(submission_id):
    submission = ContactSubmission.query.get_or_404(submission_id)
    submission.resolved = True
    db.session.commit()
    return redirect(url_for("admin.admin_dashboard"))


@admin_bp.route("/delete-submission/<int:submission_id>")
@login_required
def delete_submission(submission_id):
    submission = ContactSubmission.query.get_or_404(submission_id)
    db.session.delete(submission)
    db.session.commit()
    flash(f"Submission ID {submission_id} deleted successfully.", "success")
    return redirect(url_for("admin.admin_dashboard"))


@admin_bp.route("/bulk-action", methods=["POST"])
@login_required
def bulk_action():
    submission_ids = request.form.getlist("submission_ids")
    action = request.form.get("action")

    if not submission_ids:
        flash("No submissions selected.", "error")
        return redirect(url_for("admin.admin_dashboard"))

    if action == "resolve":
        ContactSubmission.query.filter(ContactSubmission.id.in_(submission_ids)).update(
            {ContactSubmission.resolved: True}, synchronize_session=False
        )
        db.session.commit()
        flash("Selected submissions marked as resolved.", "success")
    elif action == "delete":
        ContactSubmission.query.filter(ContactSubmission.id.in_(submission_ids)).delete(
            synchronize_session=False
        )
        db.session.commit()
        flash("Selected submissions deleted.", "success")

    return redirect(url_for("admin.admin_dashboard"))


@admin_bp.route("/donations")
def manage_donations():
    page = request.args.get("page", 1, type=int)
    query = request.args.get("query", "")
    frequency_filter = request.args.get("frequency", "")

    donations_query = Donation.query

    # Apply search query
    if query:
        donations_query = donations_query.filter(
            (Donation.name.ilike(f"%{query}%")) | (Donation.email.ilike(f"%{query}%"))
        )

    # Apply frequency filter
    if frequency_filter:
        donations_query = donations_query.filter_by(frequency=frequency_filter)

    # Pagination (10 donations per page)
    donations = donations_query.order_by(Donation.id.desc()).paginate(
        page=page, per_page=10
    )

    total_donations = db.session.query(db.func.sum(Donation.amount)).scalar() or 0
    total_ramadan_donations = (
        db.session.query(db.func.sum(Donation.amount))
        .filter(Donation.frequency == "Ramadan")
        .scalar()
        or 0
    )

    return render_template(
        "admin/admin_donations.html",
        donations=donations,
        total_donations=total_donations,
        total_ramadan_donations=total_ramadan_donations,
    )


@admin_bp.route("/export-submissions")
@login_required
def export_submissions():
    submissions = ContactSubmission.query.all()
    si = io.StringIO()
    writer = csv.writer(si)

    writer.writerow(["ID", "Name", "Email", "Message", "Submitted At", "Resolved"])
    for submission in submissions:
        writer.writerow(
            [
                submission.id,
                submission.name,
                submission.email,
                submission.message,
                submission.submitted_at,
                submission.resolved,
            ]
        )

    output = Response(si.getvalue(), mimetype="text/csv")
    output.headers["Content-Disposition"] = "attachment; filename=submissions.csv"
    return output


@admin_bp.route("/admin/stories")
@login_required
def manage_stories():
    stories = Story.query.order_by(Story.id.desc()).all()
    return render_template("admin/admin_stories.html", stories=stories)


@admin_bp.route("/admin/stories/add", methods=["GET", "POST"])
@login_required
def add_story():
    if request.method == "POST":
        title = request.form["title"]
        summary = request.form["summary"]
        content = request.form["content"]
        is_active = "is_active" in request.form
        is_featured = "is_featured" in request.form
        video_url = request.form.get("video_url", "").strip() or None

        image_file = request.files["image"]
        filename = None
        if image_file and image_file.filename:
            filename = secure_filename(image_file.filename)
            image_folder = os.path.join(
                current_app.root_path, "static", "images", "stories"
            )
            os.makedirs(image_folder, exist_ok=True)
            image_path = os.path.join(image_folder, filename)
            image_file.save(image_path)

        new_story = Story(
            title=title,
            summary=summary,
            content=content,
            image_filename=filename,
            is_active=is_active,
            is_featured=is_featured,
            video_url=video_url,
        )
        db.session.add(new_story)
        db.session.commit()
        # flash('Story added successfully.', 'success')
        return redirect(url_for("admin.manage_stories"))

    return render_template("admin/add_edit_story.html", action="Add")


@admin_bp.route("/admin/stories/edit/<int:story_id>", methods=["GET", "POST"])
@login_required
def edit_story(story_id):
    story = Story.query.get_or_404(story_id)

    if request.method == "POST":
        story.title = request.form["title"]
        story.summary = request.form["summary"]
        story.content = request.form["content"]
        is_active = "is_active" in request.form
        is_featured = "is_featured" in request.form
        story.is_active = is_active
        story.is_featured = is_featured
        story.video_url = request.form.get("video_url", "").strip() or None

        image_file = request.files["image"]
        if image_file and image_file.filename:
            filename = secure_filename(image_file.filename)
            image_folder = os.path.join(
                current_app.root_path, "static", "images", "stories"
            )
            os.makedirs(image_folder, exist_ok=True)
            image_path = os.path.join(image_folder, filename)
            image_file.save(image_path)
            story.image_filename = filename  # Just save filename, not full path

        db.session.commit()
        # flash('Story updated successfully.', 'success')
        return redirect(url_for("admin.manage_stories"))

    return render_template("admin/add_edit_story.html", action="Edit", story=story)


@admin_bp.route("/admin/stories/delete/<int:story_id>")
@login_required
def delete_story(story_id):
    story = Story.query.get_or_404(story_id)
    db.session.delete(story)
    db.session.commit()
    flash("Story deleted successfully.", "success")
    return redirect(url_for("admin.manage_stories"))


@admin_bp.route("/testimonials")
@login_required
def admin_testimonials():
    from app.models import Testimonial

    testimonials = Testimonial.query.order_by(Testimonial.created_at.desc()).all()
    return render_template("admin/admin_testimonials.html", testimonials=testimonials)


@admin_bp.route("/testimonials/approve/<int:testimonial_id>", methods=["POST"])
@login_required
def approve_testimonial(testimonial_id):
    from app.models import Testimonial

    t = Testimonial.query.get_or_404(testimonial_id)
    t.is_approved = True
    db.session.commit()
    flash("Testimonial approved.", "success")
    return redirect(url_for("admin.admin_testimonials"))


@admin_bp.route("/testimonials/delete/<int:testimonial_id>", methods=["POST"])
@login_required
def delete_testimonial(testimonial_id):
    from app.models import Testimonial

    t = Testimonial.query.get_or_404(testimonial_id)
    db.session.delete(t)
    db.session.commit()
    flash("Testimonial deleted.", "success")
    return redirect(url_for("admin.admin_testimonials"))


# 📧 Admin Manage Subscriptions
@admin_bp.route("/subscriptions")
@login_required
def manage_subscriptions():
    query = request.args.get("query", "")
    subs_query = Subscription.query
    if query:
        subs_query = subs_query.filter(
            (Subscription.name.ilike(f"%{query}%"))
            | (Subscription.email.ilike(f"%{query}%"))
            | (Subscription.phone.ilike(f"%{query}%"))
        )
    subs = subs_query.order_by(Subscription.subscribed_at.desc()).all()
    return render_template("admin/admin_subscriptions.html", subs=subs)


@admin_bp.route("/delete-subscription/<int:sub_id>")
@login_required
def delete_subscription(sub_id):
    sub = Subscription.query.get_or_404(sub_id)
    db.session.delete(sub)
    db.session.commit()
    flash(f"Subscription for {sub.email} deleted.", "success")
    return redirect(url_for("admin.manage_subscriptions"))


@admin_bp.route("/send-newsletter", methods=["GET", "POST"])
@login_required
def send_newsletter():
    sent_count = None
    if request.method == "POST":
        subject = request.form.get("subject")
        body = request.form.get("body")
        if not subject or not body:
            flash("Subject and message body are required.", "error")
            return render_template("admin/send_newsletter.html")
        # Get all subscribers who want email
        subscribers = Subscription.query.filter_by(wants_email=True).all()
        emails = [s.email for s in subscribers if s.email]
        print(f"[DEBUG] Emails to send: {emails}")  # For debugging
        sent_count = 0
        errors = []
        for email in emails:
            try:
                msg = Message(
                    subject,
                    sender=current_app.config.get("MAIL_DEFAULT_SENDER"),
                    recipients=[email],
                )
                msg.body = body
                mail.send(msg)
                sent_count += 1
            except Exception as e:
                error_msg = f"Failed to send to {email}: {e}"
                current_app.logger.error(error_msg)
                errors.append(error_msg)
        if errors:
            flash("Some emails failed to send. Check logs for details.", "error")
            flash(str(errors), "error")
        flash(f"Newsletter sent to {sent_count} subscribers.", "success")
        return render_template("admin/send_newsletter.html", sent_count=sent_count)
    return render_template("admin/send_newsletter.html")
