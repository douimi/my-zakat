-- Migration 18: Add manual donation fields to donations table
-- Supports admin-created donations (cash, cheque, credit card, other) with optional proof file.

ALTER TABLE donations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS proof_filename VARCHAR(500);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index to filter "Manual" donations quickly in admin queries
CREATE INDEX IF NOT EXISTS idx_donations_payment_method ON donations(payment_method) WHERE payment_method IS NOT NULL;

SELECT 'Migration 18 completed successfully!' as message;
