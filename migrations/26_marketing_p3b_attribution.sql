-- Migration 26: Marketing P3b — donation attribution
--
-- Closes the loop between marketing campaigns and donation revenue. The
-- tracking endpoint (P3a) already rewrites links with UTMs; this migration
-- adds the columns we need to persist UTMs onto the Donation row when the
-- Stripe webhook fires, plus revenue counters on marketing_campaigns.

ALTER TABLE donations
    ADD COLUMN IF NOT EXISTS utm_source   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS utm_medium   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100),  -- holds campaign_id as string
    ADD COLUMN IF NOT EXISTS utm_content  VARCHAR(100);  -- holds campaign_send_id as string

CREATE INDEX IF NOT EXISTS idx_donations_utm_campaign
    ON donations(utm_campaign) WHERE utm_campaign IS NOT NULL;

ALTER TABLE donation_subscriptions
    ADD COLUMN IF NOT EXISTS utm_source   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS utm_medium   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100),
    ADD COLUMN IF NOT EXISTS utm_content  VARCHAR(100);

-- Campaign-level aggregate revenue counters. Updated on donation webhook.
ALTER TABLE marketing_campaigns
    ADD COLUMN IF NOT EXISTS converted_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS revenue_cents         BIGINT  NOT NULL DEFAULT 0;

SELECT 'Migration 26 completed successfully!' as message;
