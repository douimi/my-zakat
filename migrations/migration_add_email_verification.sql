-- Migration: Add email verification fields to users table
-- Date: 2024
-- Description: Adds email_verified, verification_token, and verification_token_expires columns to support email verification

-- Add email_verified column (defaults to false for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Add verification_token column
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE;

-- Add verification_token_expires column
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;

-- Create index on verification_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Update existing users: mark admin users as verified (they don't need email verification)
UPDATE users SET email_verified = TRUE WHERE is_admin = TRUE;

-- Optional: Mark all existing non-admin users as verified if you want to skip verification for them
-- Uncomment the line below if you want existing users to be automatically verified
-- UPDATE users SET email_verified = TRUE WHERE is_admin = FALSE;

