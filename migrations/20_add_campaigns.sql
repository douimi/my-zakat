-- Migration 20: Campaigns table for homepage popup campaigns

CREATE TABLE IF NOT EXISTS campaigns (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(200)  NOT NULL,
    description     TEXT,
    image_url       VARCHAR(500),
    amount          NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cta_text        VARCHAR(100)  NOT NULL DEFAULT 'Donate Now',
    redirect_url    VARCHAR(500),         -- optional custom redirect; defaults to /donate?amount=X&purpose=<title>
    is_active       BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index: only ONE campaign can be active at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_only_one_active
    ON campaigns (is_active)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns (is_active);

SELECT 'Migration 20 completed successfully!' as message;
