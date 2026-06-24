-- Migration 25: Marketing P3a — open/click event tracking
--
-- Adds an append-only `email_events` table that records every open, click,
-- and provider event (bounce, complaint, delivered). Joined to campaign_sends
-- and email_outbox via send_id / outbox_id for drilldown.
--
-- Also adds tracking counter columns on campaign_sends so the campaign
-- analytics page can render fast aggregates without scanning email_events.

CREATE TABLE IF NOT EXISTS email_events (
    id              BIGSERIAL PRIMARY KEY,
    -- Which send produced this event. Either a campaign send or a one-off
    -- transactional email (in which case campaign_send_id is NULL).
    campaign_send_id    INTEGER REFERENCES campaign_sends(id) ON DELETE SET NULL,
    outbox_id           INTEGER REFERENCES email_outbox(id)   ON DELETE SET NULL,
    -- Denormalised so we can analyse without joining 99% of the time.
    recipient_email     VARCHAR(255) NOT NULL,
    campaign_id         INTEGER REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    event_type          VARCHAR(30)  NOT NULL,   -- delivered | open | click | bounce | complaint | unsubscribe | conversion
    occurred_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address          VARCHAR(45),
    user_agent          TEXT,
    -- For clicks: which URL was clicked (the original, pre-rewrite URL).
    url                 TEXT,
    -- Apple Mail Privacy Protection / proxy-fetched opens.
    is_mpp              BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Raw provider payload, for debugging odd events.
    metadata            JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_events_send_type
    ON email_events(campaign_send_id, event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign
    ON email_events(campaign_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient
    ON email_events(lower(recipient_email), occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_outbox
    ON email_events(outbox_id);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred
    ON email_events(occurred_at DESC);

-- Per-recipient aggregate counters (updated on event insert).
ALTER TABLE campaign_sends
    ADD COLUMN IF NOT EXISTS open_count        INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS click_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS first_open_at     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS first_click_at    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS bounced           BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS complained        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS unsubscribed      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_mpp            BOOLEAN NOT NULL DEFAULT FALSE,
    -- Tracking tokens (HMAC-signed, used by the public /track endpoints).
    ADD COLUMN IF NOT EXISTS open_token        VARCHAR(128) UNIQUE,
    ADD COLUMN IF NOT EXISTS click_token       VARCHAR(128) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_open_token  ON campaign_sends(open_token);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_click_token ON campaign_sends(click_token);

-- Per-campaign aggregate counters (updated on event insert / fan-out).
ALTER TABLE marketing_campaigns
    ADD COLUMN IF NOT EXISTS delivered_count   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS opened_count      INTEGER NOT NULL DEFAULT 0,  -- unique opens (per recipient)
    ADD COLUMN IF NOT EXISTS clicked_count     INTEGER NOT NULL DEFAULT 0,  -- unique clicks (per recipient)
    ADD COLUMN IF NOT EXISTS bounced_count     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS complained_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unsubscribed_count INTEGER NOT NULL DEFAULT 0;

SELECT 'Migration 25 completed successfully!' as message;
