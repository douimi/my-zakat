from sqlalchemy import Column, Integer, BigInteger, String, Text, Float, DateTime, Boolean, ForeignKey, UniqueConstraint, JSON, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base
from datetime import datetime

# Cross-dialect JSON: real JSONB on Postgres (production), plain JSON on
# SQLite (the in-memory test runner in CI). Behaviour from Python is
# identical — dicts/lists serialize the same way.
JSONType = JSON().with_variant(JSONB(), "postgresql")


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
    # P3b marketing attribution — populated from Stripe metadata when the
    # donor arrived via a campaign link (utm_campaign = campaign_id,
    # utm_content = campaign_send_id).
    utm_source = Column(String(100), nullable=True)
    utm_medium = Column(String(100), nullable=True)
    utm_campaign = Column(String(100), nullable=True, index=True)
    utm_content = Column(String(100), nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), nullable=False, unique=True, index=True)
    password = Column(String(200), nullable=False)
    name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    # role: 'admin' | 'manager' | 'field_staff' | 'user'. `is_admin` is kept in sync for legacy code.
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

    @property
    def is_field_staff(self) -> bool:
        return self.role == "field_staff"


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
    # P3b marketing attribution
    utm_source = Column(String(100), nullable=True)
    utm_medium = Column(String(100), nullable=True)
    utm_campaign = Column(String(100), nullable=True, index=True)
    utm_content = Column(String(100), nullable=True)


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
    attachments = Column(JSONType, nullable=False, default=list)
    context = Column(JSONType, nullable=False, default=dict)
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
    extra_metadata = Column("metadata", JSONType, nullable=False, default=dict)
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


# ─────────────────────────────────────────────────────────────────────
# Marketing P2 — templates + segments + tags + campaigns
# ─────────────────────────────────────────────────────────────────────

class EmailTemplate(Base):
    """Reusable Jinja-templated email body. Versioned via EmailTemplateVersion."""
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, default="marketing", index=True)
    subject = Column(String(500), nullable=False)
    preheader = Column(String(500), nullable=True)
    body_html = Column(Text, nullable=False)
    body_text = Column(Text, nullable=True)
    variables = Column(JSONType, nullable=False, default=list)
    current_version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailTemplateVersion(Base):
    """Immutable historical snapshot of a template. Created on every save."""
    __tablename__ = "email_template_versions"
    __table_args__ = (UniqueConstraint("template_id", "version", name="uq_template_version"),)

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    subject = Column(String(500), nullable=False)
    preheader = Column(String(500), nullable=True)
    body_html = Column(Text, nullable=False)
    body_text = Column(Text, nullable=True)
    saved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    saved_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AudienceSegment(Base):
    """Named, reusable audience filter stored as a JSONB predicate."""
    __tablename__ = "audience_segments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    definition = Column(JSONType, nullable=False, default=list)
    cached_count = Column(Integer, nullable=True)
    cached_count_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContactTag(Base):
    __tablename__ = "contact_tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(20), nullable=False, default="gray")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ContactTagAssignment(Base):
    __tablename__ = "contact_tag_assignments"

    email = Column(String(255), primary_key=True)
    tag_id = Column(Integer, ForeignKey("contact_tags.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    assigned_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class MarketingCampaign(Base):
    """A broadcast email job. Renders a template, fans out per-recipient sends."""
    __tablename__ = "marketing_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    template_id = Column(Integer, ForeignKey("email_templates.id", ondelete="SET NULL"), nullable=True)
    segment_id = Column(Integer, ForeignKey("audience_segments.id", ondelete="SET NULL"), nullable=True)
    subject_override = Column(String(500), nullable=True)
    preheader_override = Column(String(500), nullable=True)
    body_html_override = Column(Text, nullable=True)
    body_text_override = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    dispatch_token = Column(String(64), nullable=True)
    total_recipients = Column(Integer, nullable=False, default=0)
    queued_count = Column(Integer, nullable=False, default=0)
    sent_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    suppressed_count = Column(Integer, nullable=False, default=0)
    # P3 tracking aggregates (counts unique recipients, not raw events).
    delivered_count = Column(Integer, nullable=False, default=0)
    opened_count = Column(Integer, nullable=False, default=0)
    clicked_count = Column(Integer, nullable=False, default=0)
    bounced_count = Column(Integer, nullable=False, default=0)
    complained_count = Column(Integer, nullable=False, default=0)
    unsubscribed_count = Column(Integer, nullable=False, default=0)
    # P3b — donation attribution rollups.
    converted_count = Column(Integer, nullable=False, default=0)
    revenue_cents = Column(Integer, nullable=False, default=0)
    # P3c — list of S3 URLs (or any HTTPS URLs) attached to every recipient's send.
    attachment_urls = Column(JSONType, nullable=False, default=list)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CampaignSend(Base):
    """One row per (campaign, recipient) — joins to email_outbox for the actual delivery."""
    __tablename__ = "campaign_sends"
    __table_args__ = (UniqueConstraint("campaign_id", "recipient_email", name="uq_campaign_recipient"),)

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("marketing_campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(255), nullable=True)
    outbox_id = Column(Integer, ForeignKey("email_outbox.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # P3 tracking — per-recipient engagement counters + tokens.
    open_count = Column(Integer, nullable=False, default=0)
    click_count = Column(Integer, nullable=False, default=0)
    first_open_at = Column(DateTime, nullable=True)
    first_click_at = Column(DateTime, nullable=True)
    bounced = Column(Boolean, nullable=False, default=False)
    complained = Column(Boolean, nullable=False, default=False)
    unsubscribed = Column(Boolean, nullable=False, default=False)
    is_mpp = Column(Boolean, nullable=False, default=False)
    open_token = Column(String(128), unique=True, nullable=True, index=True)
    click_token = Column(String(128), unique=True, nullable=True, index=True)


# ─────────────────────────────────────────────────────────────────────
# Marketing P3 — event tracking (opens, clicks, bounces, conversions)
# ─────────────────────────────────────────────────────────────────────

class EmailEvent(Base):
    """Append-only timeline of email engagement events.

    Inserted by:
      - /track/open/{token}.gif  (open pixel)
      - /track/click/{token}     (link redirect)
      - Resend webhook           (delivered / bounce / complaint)
      - Unsubscribe endpoint     (unsubscribe)
      - Stripe webhook           (conversion — links a donation back to a send)
    """
    __tablename__ = "email_events"

    id = Column(Integer, primary_key=True, index=True)
    campaign_send_id = Column(Integer, ForeignKey("campaign_sends.id", ondelete="SET NULL"), nullable=True, index=True)
    outbox_id = Column(Integer, ForeignKey("email_outbox.id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    campaign_id = Column(Integer, ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(30), nullable=False, index=True)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    is_mpp = Column(Boolean, nullable=False, default=False)
    event_metadata = Column("metadata", JSONType, nullable=False, default=dict)


class FundraisingProject(Base):
    """A visible fundraising target with a public progress bar.

    Money is stored in cents to avoid float rounding. Two derived fields —
    `remaining_cents` and `progress_percent` — are computed on the response
    schema, not stored, so the numbers can never drift out of sync.
    """
    __tablename__ = "fundraising_projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, nullable=False, index=True)
    short_description = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    goal_cents = Column(Integer, nullable=False)
    spent_cents = Column(Integer, nullable=False, default=0)
    currency = Column(String(3), nullable=False, default="USD")
    suggested_donation_cents = Column(Integer, nullable=True)
    deadline = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="active")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    category = Column(String(100), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────
# Project proposals — digital replacement for the paper funding request
# ─────────────────────────────────────────────────────────────────────

class ProjectProposal(Base):
    """One dossier per funding request.

    The dossier holds identity and review state; the submitted content lives in
    `proposal_versions`, one immutable row per submission.

    The content columns below are LEGACY: migration 32 drops their NOT NULL
    constraints and backfills version 1 from them, the code stops reading them
    in Task 5, and migration 33 drops them. They stay here, nullable, only so
    that the window between those two migrations is safe.
    """
    __tablename__ = "project_proposals"

    id = Column(Integer, primary_key=True, index=True)

    # ── Identity (stable across versions) ──────────────────
    email = Column(String(200), nullable=False, index=True)
    full_name = Column(String(200), nullable=True)

    # ── Review state ───────────────────────────────────────
    # submitted | under_review | changes_requested | approved | rejected
    status = Column(String(20), nullable=False, default="submitted", index=True)
    current_version_id = Column(
        Integer, ForeignKey("proposal_versions.id", ondelete="SET NULL"), nullable=True
    )
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # ── Legacy content columns (see the docstring) ─────────
    national_id = Column(String(50), nullable=True)
    date_of_birth_year = Column(Integer, nullable=True)
    place_of_residence = Column(String(300), nullable=True)
    mobile_number = Column(String(50), nullable=True)
    educational_level = Column(String(200), nullable=True)
    project_name = Column(String(300), nullable=True)
    project_description = Column(Text, nullable=True)
    problem_solved = Column(Text, nullable=True)
    target_beneficiaries = Column(Text, nullable=True)
    community_impact = Column(Text, nullable=True)
    expected_impact = Column(Text, nullable=True)
    implementation_steps = Column(Text, nullable=True)
    implementation_location = Column(Text, nullable=True)
    required_materials = Column(Text, nullable=True)
    expected_duration = Column(String(300), nullable=True)
    continuity_plan = Column(Text, nullable=True)
    feasibility = Column(Text, nullable=True)
    expected_challenges = Column(Text, nullable=True)
    number_of_beneficiaries = Column(Integer, nullable=True)
    cost_per_unit_usd = Column(Float, nullable=True)
    unit_type = Column(String(50), nullable=True)
    additional_expenses_usd = Column(Float, nullable=True, default=0)
    additional_expenses_description = Column(Text, nullable=True)
    total_amount_usd = Column(Float, nullable=True)
    admin_notes = Column(Text, nullable=True)
    submitted_ip = Column(String(45), nullable=True)
    sms_consent = Column(Boolean, nullable=True, default=False)
    sms_consent_at = Column(DateTime, nullable=True)
    sms_consent_text = Column(Text, nullable=True)


class ProposalVersion(Base):
    """One submission of a proposal's content. Written once, never rewritten.

    A decision is recorded on the version it judges. Once a newer version
    exists, the older one is unreachable for writing — no endpoint addresses a
    non-current version for anything but reading.

    Two FKs point at users.id / project_proposals.id but this model declares no
    relationship(); like the rest of models.py, callers query explicitly. Note
    that `ON DELETE CASCADE` below does NOT fire under the SQLite test runner,
    which leaves foreign keys unenforced — the delete endpoint removes versions
    itself rather than trusting the database.
    """
    __tablename__ = "proposal_versions"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(
        Integer, ForeignKey("project_proposals.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    version_no = Column(Integer, nullable=False)

    # ── Section 1: Personal ────────────────────────────────
    full_name = Column(String(200), nullable=False)
    national_id = Column(String(50), nullable=False)
    date_of_birth_year = Column(Integer, nullable=False)
    place_of_residence = Column(String(300), nullable=False)
    mobile_number = Column(String(50), nullable=False)
    email = Column(String(200), nullable=False)
    educational_level = Column(String(200), nullable=False)

    # ── Section 2: Project ─────────────────────────────────
    project_name = Column(String(300), nullable=False)
    project_description = Column(Text, nullable=False)
    problem_solved = Column(Text, nullable=False)
    target_beneficiaries = Column(Text, nullable=False)
    community_impact = Column(Text, nullable=False)
    expected_impact = Column(Text, nullable=False)

    # ── Section 3: Plan ────────────────────────────────────
    implementation_steps = Column(Text, nullable=False)
    implementation_location = Column(Text, nullable=False)
    required_materials = Column(Text, nullable=False)
    expected_duration = Column(String(300), nullable=False)
    continuity_plan = Column(Text, nullable=False)
    feasibility = Column(Text, nullable=False)
    expected_challenges = Column(Text, nullable=False)

    # ── Section 4: Budget ──────────────────────────────────
    number_of_beneficiaries = Column(Integer, nullable=False)
    cost_per_unit_usd = Column(Float, nullable=False)
    unit_type = Column(String(50), nullable=False)
    additional_expenses_usd = Column(Float, nullable=False, default=0)
    additional_expenses_description = Column(Text, nullable=True)
    total_amount_usd = Column(Float, nullable=False)

    # ── This submission's own metadata ─────────────────────
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    submitted_ip = Column(String(45), nullable=True)

    # 10DLC / TCR proof-of-consent belongs to the submission act, not to the
    # dossier: it records what this applicant agreed to, at this moment.
    sms_consent = Column(Boolean, nullable=False, default=False)
    sms_consent_at = Column(DateTime, nullable=True)
    sms_consent_text = Column(Text, nullable=True)

    # ── The decision on this version ───────────────────────
    # NULL = awaiting review | approved | rejected | changes_requested
    decision = Column(String(20), nullable=True)
    decision_comment = Column(Text, nullable=True)   # shown to the submitter
    internal_note = Column(Text, nullable=True)      # staff only
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("proposal_id", "version_no", name="uq_proposal_version_no"),
    )


class ProposalAccessCode(Base):
    """A one-time six-digit code granting a submitter access to their dossiers.

    The code itself is never stored: only its bcrypt hash. A row is consumed on
    first successful use, and burned once `attempts` reaches the cap.
    """
    __tablename__ = "proposal_access_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    request_ip = Column(String(45), nullable=True)


# ─────────────────────────────────────────────────────────────────────
# Media library — per-user workspaces on top of S3
# ─────────────────────────────────────────────────────────────────────

class MediaAsset(Base):
    """A single photo or video in a staff member's media workspace.

    Privacy is a column, not a location: the object lands once at `object_key`
    and never moves, and `status` alone decides who may read the bytes.
    `search_text` is denormalized on every write so search is one ILIKE that
    behaves identically on PostgreSQL and on the SQLite used in tests.
    """
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)

    # migrations/31_add_media_library.sql owns this table's indexes, not this
    # model. Several of them are composite or partial (owner_id + created_at,
    # owner_id + checksum_sha256, a WHERE status = 'submitted' partial index)
    # and cannot be expressed as a bare Column(index=True). create_all() emits
    # SQLAlchemy's own ix_ names, which don't collide with the migration's
    # idx_ names, so a Column(index=True) here does not replace the
    # migration's index for that column — it adds a second, redundant one.
    # This is why the columns below carry no index=True even though several
    # of them are filtered or sorted on: the index already exists, created by
    # the migration. `object_key` is the one exception that keeps a
    # SQLAlchemy-level constraint (unique=True): the test suite needs that
    # uniqueness enforced when it builds its schema from this model, and
    # unique=True already creates its own index, so no separate index=True
    # is added on top of it.

    # NULL owner = the "Unassigned" workspace: legacy media, or media whose
    # owner's account was deleted.
    #
    # This model has two FKs to users.id (owner_id, reviewed_by_id). There are
    # no relationship() calls on MediaAsset today; the first one added must
    # pass foreign_keys= explicitly or SQLAlchemy raises
    # AmbiguousForeignKeysError.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    object_key = Column(String(500), nullable=False, unique=True)
    filename = Column(String(255), nullable=False)
    media_type = Column(String(10), nullable=False)  # 'image' | 'video'
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0, server_default=text("0"))
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    thumbnail_key = Column(String(500), nullable=True)
    checksum_sha256 = Column(String(64), nullable=True)
    title = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSONType, nullable=False, default=list, server_default=text("'[]'"))
    search_text = Column(Text, nullable=False, default="", server_default="")
    # 'private' (owner + admins) | 'submitted' (awaiting review, still private)
    # | 'public' (served to anyone)
    status = Column(String(20), nullable=False, default="private", server_default="private")
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    # Set by a rejection (submitted -> private) *or* an unpublish
    # (public -> private) -- don't assume it only ever means "why your
    # submission came back".
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
