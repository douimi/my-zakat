from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base
from datetime import datetime


class GalleryItem(Base):
    __tablename__ = "gallery_items"
    
    id = Column(Integer, primary_key=True, index=True)
    media_filename = Column(String(255), nullable=False)
    thumbnail_url = Column(String(500), nullable=True)  # Thumbnail URL for videos
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContactSubmission(Base):
    __tablename__ = "contact_submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    resolved = Column(Boolean, default=False)


class Donation(Base):
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    frequency = Column(String(50), nullable=False)
    stripe_session_id = Column(String(255), nullable=True)  # Track Stripe session for updates
    certificate_filename = Column(String(255), nullable=True)  # PDF certificate filename
    donated_at = Column(DateTime, default=datetime.utcnow)
    # Manual donation fields (cash, check, etc.)
    payment_method = Column(String(50), nullable=True)        # Cash / Check / Credit Card / Other / Stripe
    proof_filename = Column(String(500), nullable=True)       # S3 key of the proof file
    notes = Column(Text, nullable=True)                       # Admin notes


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), nullable=False, unique=True, index=True)
    password = Column(String(200), nullable=False)
    name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    # role: 'admin' | 'manager' | 'user'. `is_admin` is kept in sync for legacy code.
    role = Column(String(20), nullable=False, default="user", server_default="user", index=True)
    is_admin = Column(Boolean, default=False)
    email_verified = Column(Boolean, default=False)
    verification_token = Column(String(255), nullable=True, unique=True, index=True)
    verification_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def is_manager(self) -> bool:
        return self.role == "manager"


class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    date = Column(DateTime, nullable=False)
    location = Column(String(255), nullable=False)
    image = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Volunteer(Base):
    __tablename__ = "volunteers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    interest = Column(String(100), nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)


class Story(Base):
    __tablename__ = "stories"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    image_filename = Column(String(200))
    video_filename = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_featured = Column(Boolean, default=False)
    # Approval workflow: manager-created (or manager-edited) stories stay hidden
    # from the public site until an admin approves them.
    is_pending_approval = Column(Boolean, default=False, nullable=False, server_default="false", index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class PressRelease(Base):
    __tablename__ = "press_releases"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    image_filename = Column(String(100), nullable=True)
    date_posted = Column(DateTime, default=datetime.utcnow)


class Testimonial(Base):
    __tablename__ = "testimonials"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    country = Column(String(100), nullable=True)
    image = Column(String(255), nullable=True)
    text = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)
    video_filename = Column(String(255), nullable=True)
    category = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_approved = Column(Boolean, default=False)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    email = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True, index=True)
    wants_email = Column(Boolean, default=True)
    wants_sms = Column(Boolean, default=False)
    subscribed_at = Column(DateTime, default=datetime.utcnow)
    # 10DLC / TCPA proof-of-consent: capture the exact moment, source IP, and
    # disclosure wording the user agreed to when they opted in to SMS.
    sms_consent_at = Column(DateTime, nullable=True)
    sms_consent_ip = Column(String(45), nullable=True)
    sms_consent_text = Column(Text, nullable=True)


class DonationSubscription(Base):
    __tablename__ = "donation_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=False)
    stripe_customer_id = Column(String(255), nullable=False)
    stripe_session_id = Column(String(255), nullable=True)  # Track Stripe session for updates
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    purpose = Column(String(100), nullable=False)
    interval = Column(String(20), nullable=False)  # "month" or "year"
    payment_day = Column(Integer, nullable=False)  # Day of month (1-31)
    payment_month = Column(Integer, nullable=True)  # Month for annual (1-12)
    status = Column(String(50), default="active")  # active, canceled, past_due
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    next_payment_date = Column(DateTime, nullable=True)


class Setting(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(String(500), nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SlideshowSlide(Base):
    __tablename__ = "slideshow_slides"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    image_filename = Column(String(255), nullable=True)  # Deprecated - use image_url instead
    image_url = Column(String(500), nullable=True)  # Preferred: direct image URL
    cta_text = Column(String(100), nullable=True)
    cta_url = Column(String(500), nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UrgentNeed(Base):
    __tablename__ = "urgent_needs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    short_description = Column(Text, nullable=True)
    html_content = Column(Text, nullable=True)
    css_content = Column(Text, nullable=True)
    js_content = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Campaign(Base):
    """Occasional campaign shown as a centered popup on the homepage.

    Only one campaign should be active at a time — the API enforces this when
    toggling. Clicking the popup redirects to /donate with the amount
    pre-filled, or to a custom redirect_url if provided.
    """
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    amount = Column(Float, nullable=False, default=0)
    cta_text = Column(String(100), nullable=False, default="Donate Now")
    redirect_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProgramCategory(Base):
    __tablename__ = "program_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    short_description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    video_filename = Column(String(255), nullable=True)
    impact_text = Column(String(255), nullable=True)
    # Page content fields for category detail page
    html_content = Column(Text, nullable=True)
    css_content = Column(Text, nullable=True)
    js_content = Column(Text, nullable=True)
    # Category page slideshow (separate from home page slideshow)
    category_slideshow_id = Column(Integer, nullable=True)  # Reference to slideshow_slides if needed
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Program(Base):
    __tablename__ = "programs"
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, nullable=False, index=True)  # Foreign key to program_categories
    title = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    short_description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    video_filename = Column(String(255), nullable=True)
    # Program page content fields
    html_content = Column(Text, nullable=True)
    css_content = Column(Text, nullable=True)
    js_content = Column(Text, nullable=True)
    impact_text = Column(String(255), nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ─────────────────────────────────────────────────────────────────────
# Marketing P1 — durable outbox + compliance core
# ─────────────────────────────────────────────────────────────────────

class EmailOutbox(Base):
    """Every outbound email is recorded here BEFORE it's enqueued.

    The Arq worker pulls rows in `pending` state, attempts delivery via
    Resend, and updates `status`. Restart-safe — a container crash never
    loses a queued email.
    """
    __tablename__ = "email_outbox"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(20), nullable=False, default="transactional", index=True)
    template_slug = Column(String(100), nullable=True)
    to_email = Column(String(255), nullable=False, index=True)
    to_name = Column(String(255), nullable=True)
    from_email = Column(String(255), nullable=False)
    from_name = Column(String(255), nullable=True)
    reply_to = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=False)
    body_html = Column(Text, nullable=False)
    body_text = Column(Text, nullable=True)
    attachments = Column(JSONB, nullable=False, default=list)
    context = Column(JSONB, nullable=False, default=dict)
    idempotency_key = Column(String(128), unique=True, nullable=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    provider_message_id = Column(String(255), nullable=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    queue_after = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailSuppression(Base):
    """Global suppression list — checked by ComplianceMailer before every send.

    Hard bounces and complaints are inserted automatically via the Resend
    webhook; manual entries via the admin Suppressions page.
    """
    __tablename__ = "email_suppressions"
    __table_args__ = (UniqueConstraint("email", "scope", name="uq_email_suppression"),)

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    scope = Column(String(20), nullable=False, default="all")  # marketing | all | <category>
    reason = Column(String(50), nullable=False)  # hard_bounce | complaint | unsubscribe | manual | gdpr_erasure
    source_message_id = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class EmailConsentLog(Base):
    """Append-only audit trail of every email consent event.

    Mirrors the SMS consent fields on Subscription. Required for
    CAN-SPAM / GDPR audits — never updated, only inserted.
    """
    __tablename__ = "email_consent_log"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    channel = Column(String(20), nullable=False, default="email")
    action = Column(String(30), nullable=False)  # opt_in | opt_out | re_confirmed | ...
    source = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    consent_text = Column(Text, nullable=True)
    extra_metadata = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class EmailUnsubscribeToken(Base):
    """One-use unsubscribe tokens for one-click links and RFC 8058 compliance."""
    __tablename__ = "email_unsubscribe_tokens"

    token = Column(String(128), primary_key=True)
    email = Column(String(255), nullable=False, index=True)
    scope = Column(String(20), nullable=False, default="all")
    issued_for = Column(String(50), nullable=True)
    used_at = Column(DateTime, nullable=True)
    used_ip = Column(String(45), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
