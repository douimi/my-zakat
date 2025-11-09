-- Migration: Add stripe_session_id columns to existing database
-- Run this script to add the missing columns to your existing database

-- Add stripe_session_id column to donations table
ALTER TABLE donations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Add stripe_session_id column to donation_subscriptions table  
ALTER TABLE donation_subscriptions ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_donations_stripe_session_id ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donation_subscriptions_stripe_session_id ON donation_subscriptions(stripe_session_id);

-- Verify the columns were added
SELECT 'Migration completed successfully. Columns added:' as message;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('donations', 'donation_subscriptions') 
AND column_name = 'stripe_session_id';
