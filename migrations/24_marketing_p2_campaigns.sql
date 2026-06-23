-- Migration 24: Marketing P2 — templates, segments, campaigns
--
-- Builds on top of the P1 outbox + compliance core (migration 23). Adds:
--   * email_templates (+ versioned snapshots) — reusable Jinja-templated bodies.
--   * audience_segments — JSONB predicate trees, compiled to SQL at query time.
--   * contact_tags + contact_tag_assignments — manual curation across all sources.
--   * marketing_campaigns (+ campaign_sends) — broadcast scheduling and per-recipient
--     send rows that piggyback on the existing email_outbox for delivery.

-- ─── Templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(100)  NOT NULL UNIQUE,
    name            VARCHAR(255)  NOT NULL,
    category        VARCHAR(50)   NOT NULL DEFAULT 'marketing',  -- marketing | transactional | system
    subject         VARCHAR(500)  NOT NULL,
    preheader       VARCHAR(500),
    body_html       TEXT          NOT NULL,
    body_text       TEXT,
    variables       JSONB         NOT NULL DEFAULT '[]'::jsonb,  -- ["first_name", "amount", ...]
    current_version INTEGER       NOT NULL DEFAULT 1,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);

CREATE TABLE IF NOT EXISTS email_template_versions (
    id              SERIAL PRIMARY KEY,
    template_id     INTEGER       NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    version         INTEGER       NOT NULL,
    subject         VARCHAR(500)  NOT NULL,
    preheader       VARCHAR(500),
    body_html       TEXT          NOT NULL,
    body_text       TEXT,
    saved_by        INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    saved_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_version UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON email_template_versions(template_id, version DESC);

-- ─── Segments ────────────────────────────────────────────────────────
-- A segment is a named, reusable audience filter expressed as a JSONB
-- predicate tree. The compiler in Python translates it to SQL filters
-- over the marketing_contacts UNION query.
CREATE TABLE IF NOT EXISTS audience_segments (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL,
    description     TEXT,
    definition      JSONB         NOT NULL DEFAULT '[]'::jsonb,
    -- Cached count for fast list rendering; refreshed on save + on every preview call.
    cached_count    INTEGER,
    cached_count_at TIMESTAMP,
    created_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Tags ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_tags (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100)  NOT NULL UNIQUE,
    color           VARCHAR(20)   NOT NULL DEFAULT 'gray',  -- gray | blue | green | amber | red | purple
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_tag_assignments (
    email           VARCHAR(255)  NOT NULL,
    tag_id          INTEGER       NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by     INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (email, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_email ON contact_tag_assignments(lower(email));

-- ─── Marketing campaigns ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200)  NOT NULL,
    template_id         INTEGER       REFERENCES email_templates(id) ON DELETE SET NULL,
    segment_id          INTEGER       REFERENCES audience_segments(id) ON DELETE SET NULL,
    -- Overrides — if NULL, fall back to the template's values at send time.
    subject_override    VARCHAR(500),
    preheader_override  VARCHAR(500),
    body_html_override  TEXT,
    body_text_override  TEXT,
    -- Lifecycle.
    status              VARCHAR(20)   NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent | canceled | failed
    scheduled_at        TIMESTAMP,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    -- Idempotency key for the send-now operation — prevents double-broadcast on retry.
    dispatch_token      VARCHAR(64),
    -- Aggregated counters for fast dashboard reads.
    total_recipients    INTEGER       NOT NULL DEFAULT 0,
    queued_count        INTEGER       NOT NULL DEFAULT 0,
    sent_count          INTEGER       NOT NULL DEFAULT 0,
    failed_count        INTEGER       NOT NULL DEFAULT 0,
    suppressed_count    INTEGER       NOT NULL DEFAULT 0,
    -- Audit.
    created_by          INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created ON marketing_campaigns(created_at DESC);

-- Per-recipient send rows. One row per (campaign_id, recipient_email). Joined
-- to email_outbox via outbox_id so we can drill from a campaign down to the
-- exact rendered email, delivery status, and any failure message.
CREATE TABLE IF NOT EXISTS campaign_sends (
    id                  SERIAL PRIMARY KEY,
    campaign_id         INTEGER       NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    recipient_email     VARCHAR(255)  NOT NULL,
    recipient_name      VARCHAR(255),
    outbox_id           INTEGER       REFERENCES email_outbox(id) ON DELETE SET NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending | queued | sent | failed | suppressed
    error               TEXT,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_campaign_recipient UNIQUE (campaign_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status ON campaign_sends(status);

SELECT 'Migration 24 completed successfully!' as message;
