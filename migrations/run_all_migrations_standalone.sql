-- MyZakat Database Setup Script (Standalone Version)
-- This script contains all migrations in a single file for easy execution
-- Use this when you cannot use \i commands (e.g., in database management tools)
-- Run this script on a new database to set up the complete schema

\set ON_ERROR_STOP on

SELECT '========================================' as message;
SELECT 'MyZakat Database Migration Script' as message;
SELECT 'Starting complete database setup...' as message;
SELECT '========================================' as message;

-- ========================================
-- Migration 00: Initialize database structure
-- ========================================
SELECT 'Running Migration 00: Initialize database structure...' as message;

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

CREATE INDEX IF NOT EXISTS idx_donations_stripe_session_id ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donation_subscriptions_stripe_session_id ON donation_subscriptions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(featured);
CREATE INDEX IF NOT EXISTS idx_testimonials_featured ON testimonials(featured);

SELECT 'Migration 00 completed successfully!' as message;

-- ========================================
-- Migration 01: Add users table
-- ========================================
SELECT 'Running Migration 01: Add users table...' as message;

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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
ALTER TABLE donation_subscriptions ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_donations_stripe_session_id ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donation_subscriptions_stripe_session_id ON donation_subscriptions(stripe_session_id);

SELECT 'Migration 01 completed successfully!' as message;

-- ========================================
-- Migration 02: Add email verification
-- ========================================
SELECT 'Running Migration 02: Add email verification...' as message;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
UPDATE users SET email_verified = TRUE WHERE is_admin = TRUE;

SELECT 'Migration 02 completed successfully!' as message;

-- ========================================
-- Migration 03: Add certificate filename
-- ========================================
SELECT 'Running Migration 03: Add certificate filename...' as message;

ALTER TABLE donations ADD COLUMN IF NOT EXISTS certificate_filename VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_donations_certificate_filename ON donations(certificate_filename) WHERE certificate_filename IS NOT NULL;

SELECT 'Migration 03 completed successfully!' as message;

-- ========================================
-- Migration 04: Consolidate authentication
-- ========================================
SELECT 'Running Migration 04: Consolidate authentication...' as message;

DO $$
DECLARE
    admin_exists INTEGER;
    admin_username VARCHAR(100);
    admin_password VARCHAR(200);
BEGIN
    SELECT COUNT(*) INTO admin_exists FROM users WHERE is_admin = true;
    
    IF admin_exists = 0 THEN
        BEGIN
            SELECT username, password INTO admin_username, admin_password 
            FROM admins 
            LIMIT 1;
            
            IF admin_username IS NOT NULL THEN
                INSERT INTO users (email, password, name, is_active, is_admin, created_at, updated_at)
                VALUES (
                    admin_username || '@admin.local',
                    admin_password,
                    admin_username,
                    true,
                    true,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (email) DO UPDATE 
                SET is_admin = true;
                
                RAISE NOTICE 'Migrated admin user: % to email: %@admin.local', admin_username, admin_username;
            END IF;
        EXCEPTION
            WHEN undefined_table THEN
                RAISE NOTICE 'Admins table does not exist, skipping migration';
        END;
        
        SELECT COUNT(*) INTO admin_exists FROM users WHERE is_admin = true;
        IF admin_exists = 0 THEN
            INSERT INTO users (email, password, name, is_active, is_admin, created_at, updated_at)
            VALUES (
                'admin@example.com',
                '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU8rR5FsLLqe',
                'Super Admin',
                true,
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (email) DO UPDATE 
            SET is_admin = true;
            
            RAISE NOTICE 'Created default admin user: admin@example.com (password: admin123)';
            RAISE NOTICE 'IMPORTANT: Please change this password immediately!';
        END IF;
    ELSE
        RAISE NOTICE 'Admin user already exists, skipping creation';
    END IF;
END $$;

DROP TABLE IF EXISTS admins CASCADE;

SELECT 'Migration 04 completed successfully!' as message;

-- ========================================
-- Migration 05: Add slideshow
-- ========================================
SELECT 'Running Migration 05: Add slideshow...' as message;

CREATE TABLE IF NOT EXISTS slideshow_slides (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_filename VARCHAR(255),
    cta_text VARCHAR(100),
    cta_url VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_slideshow_slides_order ON slideshow_slides(display_order, is_active);

INSERT INTO settings (key, value, description) VALUES
('sticky_donation_bar_enabled', 'false', 'Enable or disable the sticky donation bar on the homepage')
ON CONFLICT (key) DO NOTHING;

SELECT 'Migration 05 completed successfully!' as message;

-- ========================================
-- Migration 06: Add slideshow image URL
-- ========================================
SELECT 'Running Migration 06: Add slideshow image URL...' as message;

ALTER TABLE slideshow_slides ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

SELECT 'Migration 06 completed successfully!' as message;

-- ========================================
-- Migration 07: Add urgent needs
-- ========================================
SELECT 'Running Migration 07: Add urgent needs...' as message;

CREATE TABLE IF NOT EXISTS urgent_needs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    short_description TEXT,
    html_content TEXT,
    css_content TEXT,
    js_content TEXT,
    image_url VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_urgent_needs_order ON urgent_needs(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_urgent_needs_slug ON urgent_needs(slug);

SELECT 'Migration 07 completed successfully!' as message;

-- ========================================
-- Migration 08: Add emergency banner settings
-- ========================================
SELECT 'Running Migration 08: Add emergency banner settings...' as message;

INSERT INTO settings (key, value, description) VALUES
('emergency_banner_enabled', 'true', 'Enable or disable the emergency banner at the top of pages'),
('emergency_banner_message', 'Emergency Relief Needed: Support families affected by the crisis.', 'Emergency banner message text'),
('emergency_banner_cta_text', 'Donate Now', 'Emergency banner call-to-action button text'),
('emergency_banner_cta_url', '/donate', 'Emergency banner call-to-action button URL')
ON CONFLICT (key) DO NOTHING;

SELECT 'Migration 08 completed successfully!' as message;

-- ========================================
-- Migration Complete
-- ========================================
SELECT '========================================' as message;
SELECT 'All migrations completed successfully!' as message;
SELECT 'Database is ready to use.' as message;
SELECT '========================================' as message;

-- Display summary
SELECT 'Database Summary:' as message;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

