-- Migration 01: Add users table and ensure all schema updates
-- Run this script to add the users table and update existing tables

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL,
    name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add stripe_session_id column to donations table if not exists
ALTER TABLE donations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Add stripe_session_id column to donation_subscriptions table if not exists
ALTER TABLE donation_subscriptions ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_donations_stripe_session_id ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donation_subscriptions_stripe_session_id ON donation_subscriptions(stripe_session_id);

-- Verify the migration
SELECT 'Migration 01 completed successfully!' as message;

