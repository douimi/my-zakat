-- Migration 23: Marketing P1 — durable email outbox + compliance core
--
-- Lays the foundation for the new marketing automation system. Everything in
-- this migration is consumed in P1; later phases (segments, campaigns,
-- automations, tracking) add tables on top of this.

-- ─── Outbox ──────────────────────────────────────────────────────────
-- Every outbound email gets a row in this table BEFORE it is enqueued for
-- delivery. The Arq worker reads from it, attempts the send, and updates the
-- status. Restart-safe: a container restart never loses queued mail.
CREATE TABLE IF NOT EXISTS email_outbox (
    id                  SERIAL PRIMARY KEY,
    -- Logical category — used for suppression scoping (a hard-bounce on
    -- marketing must not block transactional receipts).
    category            VARCHAR(20)   NOT NULL DEFAULT 'transactional', -- transactional | marketing | system
    template_slug       VARCHAR(100),
    to_email            VARCHAR(255)  NOT NULL,
    to_name             VARCHAR(255),
    from_email          VARCHAR(255)  NOT NULL,
    from_name           VARCHAR(255),
    reply_to            VARCHAR(255),
    subject             VARCHAR(500)  NOT NULL,
    body_html           TEXT          NOT NULL,
    body_text           TEXT,
    -- JSON list of {filename, content_b64, content_type}.
    attachments         JSONB         NOT NULL DEFAULT '[]'::jsonb,
    -- Merge context recorded for audit + future re-render.
    context             JSONB         NOT NULL DEFAULT '{}'::jsonb,
    -- Idempotency key — unique per logical email event so retries don't double-send.
    idempotency_key     VARCHAR(128)  UNIQUE,
    status              VARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending | sending | sent | failed | suppressed
    provider_message_id VARCHAR(255),  -- Resend's message id, captured on success
    error               TEXT,
    attempts            INTEGER       NOT NULL DEFAULT 0,
    max_attempts        INTEGER       NOT NULL DEFAULT 3,
    queue_after         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at             TIMESTAMP,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_queue_after
    ON email_outbox(status, queue_after) WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_outbox_to_email     ON email_outbox(to_email);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at   ON email_outbox(created_at DESC);

-- ─── Suppressions ────────────────────────────────────────────────────
-- Global suppression list. Consulted by ComplianceMailer before EVERY send.
-- Hard bounces and complaints are added automatically by the Resend webhook;
-- manual entries by admin (CSV import / phone-in unsubscribe).
CREATE TABLE IF NOT EXISTS email_suppressions (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255)  NOT NULL,
    -- Which categories are suppressed: 'marketing', 'all', or a specific category.
    scope               VARCHAR(20)   NOT NULL DEFAULT 'all',
    reason              VARCHAR(50)   NOT NULL, -- hard_bounce | complaint | unsubscribe | manual | gdpr_erasure
    source_message_id   VARCHAR(255),
    note                TEXT,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A user can be suppressed once per scope.
    CONSTRAINT uq_email_suppression UNIQUE (email, scope)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_email ON email_suppressions(lower(email));

-- ─── Consent log ─────────────────────────────────────────────────────
-- Append-only audit trail of every consent event (opt-in, opt-out,
-- re-confirmation). Mirrors the existing SMS consent shape on the
-- subscriptions table. Required for CAN-SPAM / GDPR audits.
CREATE TABLE IF NOT EXISTS email_consent_log (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255)  NOT NULL,
    channel             VARCHAR(20)   NOT NULL DEFAULT 'email', -- email | sms
    action              VARCHAR(30)   NOT NULL, -- opt_in | opt_out | re_confirmed | double_opt_in_pending | double_opt_in_confirmed
    source              VARCHAR(100), -- 'signup_form' | 'donation_form' | 'unsubscribe_link' | 'admin_manual' | 'webhook'
    ip_address          VARCHAR(45),
    user_agent          TEXT,
    consent_text        TEXT,         -- Exact wording the user agreed to (or N/A for system events)
    metadata            JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_log_email_created
    ON email_consent_log(lower(email), created_at DESC);

-- ─── Unsubscribe tokens ──────────────────────────────────────────────
-- Used for one-click unsubscribe links. Tokens are HMAC-signed in code; this
-- table tracks single-use enforcement and provides an audit trail.
CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
    token               VARCHAR(128)  PRIMARY KEY,
    email               VARCHAR(255)  NOT NULL,
    scope               VARCHAR(20)   NOT NULL DEFAULT 'all',
    issued_for          VARCHAR(50),  -- 'campaign:42' | 'transactional' | etc.
    used_at             TIMESTAMP,
    used_ip             VARCHAR(45),
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unsub_tokens_email ON email_unsubscribe_tokens(lower(email));

SELECT 'Migration 23 completed successfully!' as message;
