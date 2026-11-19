-- Migration 43: why a donation did not go through, and the email that offers help.
--
-- A failed or abandoned donation used to keep only a short code squeezed into
-- `frequency` ("Failed - card_declined"); Stripe's own explanation was thrown
-- away. These columns keep it, so staff can see why without opening Stripe.
--
-- The follow-up columns drive the "may we help you complete your gift?" email.
-- The webhook schedules it (followup_status = 'scheduled', followup_due_at);
-- the worker sends it once the delay has passed, unless the donor completed a
-- donation in the meantime or was already written to recently. Rows that
-- existed before this migration keep followup_status NULL and are never
-- emailed: nobody gets a message about a payment that failed months ago.
--
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

ALTER TABLE donations ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100) NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS failure_detail TEXT NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS followup_status VARCHAR(30) NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMP NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_donations_followup_scheduled
    ON donations (followup_due_at) WHERE followup_status = 'scheduled';

SELECT 'Migration 43 completed successfully!' as message;
