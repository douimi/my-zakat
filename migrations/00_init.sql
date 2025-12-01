-- Migration 00: Initialize MyZakat Database
-- This file creates the initial database structure and data
-- Run this first on a new database

-- Enable logging for debugging
\set ECHO all
\set ON_ERROR_STOP on

-- Print initialization start message
SELECT 'Starting MyZakat database initialization...' as message;

-- Create all tables
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_submissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS donations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    amount FLOAT NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    stripe_session_id VARCHAR(255),
    donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    date TIMESTAMP NOT NULL,
    location VARCHAR(255) NOT NULL,
    image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS volunteers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    message TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    image VARCHAR(255),
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS testimonials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    rating INTEGER DEFAULT 5,
    image VARCHAR(255),
    country VARCHAR(100),
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS donation_subscriptions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    amount FLOAT NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    stripe_subscription_id VARCHAR(255),
    stripe_session_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
('site_name', 'MyZakat', 'Site name'),
('site_description', 'Zakat Distribution Foundation', 'Site description'),
('hero_video', '', 'Hero video URL or filename'),
('hero_image', '', 'Hero image URL or filename'),
('program_image_1', '', 'Program 1 image URL or filename'),
('program_image_2', '', 'Program 2 image URL or filename'),
('program_image_3', '', 'Program 3 image URL or filename'),
('gallery_item_1', '', 'Gallery item 1 URL or filename'),
('gallery_item_2', '', 'Gallery item 2 URL or filename'),
('gallery_item_3', '', 'Gallery item 3 URL or filename'),
('gallery_item_4', '', 'Gallery item 4 URL or filename'),
('gallery_item_5', '', 'Gallery item 5 URL or filename'),
('gallery_item_6', '', 'Gallery item 6 URL or filename'),
('emergency_banner_enabled', 'true', 'Enable or disable the emergency banner at the top of pages'),
('emergency_banner_message', 'Emergency Relief Needed: Support families affected by the crisis.', 'Emergency banner message text'),
('emergency_banner_cta_text', 'Donate Now', 'Emergency banner call-to-action button text'),
('emergency_banner_cta_url', '/donate', 'Emergency banner call-to-action button URL')
ON CONFLICT (key) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_donations_stripe_session_id ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donation_subscriptions_stripe_session_id ON donation_subscriptions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(featured);
CREATE INDEX IF NOT EXISTS idx_testimonials_featured ON testimonials(featured);

SELECT 'Initial database structure created successfully!' as message;

