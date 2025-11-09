-- Migration: Add certificate_filename column to donations table
-- Date: 2024

ALTER TABLE donations ADD COLUMN IF NOT EXISTS certificate_filename VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_donations_certificate_filename ON donations(certificate_filename) WHERE certificate_filename IS NOT NULL;

