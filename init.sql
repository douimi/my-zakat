-- Initialize MyZakat Database
-- This file creates the initial database structure and data

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
    interest VARCHAR(100) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    image_filename VARCHAR(200),
    video_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS press_releases (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    image_filename VARCHAR(100),
    date_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS testimonials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100),
    image VARCHAR(255),
    text TEXT NOT NULL,
    rating INTEGER,
    video_url VARCHAR(255),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_approved BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    wants_email BOOLEAN DEFAULT TRUE,
    wants_sms BOOLEAN DEFAULT FALSE,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value VARCHAR(500) NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (username: admin, password: admin)
-- Password hash for 'admin' using bcrypt
-- Generated with: python -c "from passlib.hash import bcrypt; print(bcrypt.hash('admin'))"
DELETE FROM admins WHERE username = 'admin';
INSERT INTO admins (username, password) 
VALUES ('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj1VsEBqrxnO');

-- Verify admin user was created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM admins WHERE username = 'admin') THEN
        RAISE NOTICE 'Admin user successfully created with username: admin';
    ELSE
        RAISE EXCEPTION 'Failed to create admin user!';
    END IF;
END $$;

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
('meals_provided', '25000', 'Total number of meals provided to families in need'),
('families_supported', '1200', 'Total number of families supported through our programs'),
('orphans_cared_for', '800', 'Total number of orphans receiving care and support'),
('total_raised', '500000', 'Total amount raised in USD for all programs'),
('hero_video', '', 'Main video displayed on the homepage hero section'),
('program_image_1', '', 'First program image on homepage'),
('program_image_2', '', 'Second program image on homepage'),
('program_image_3', '', 'Third program image on homepage'),
('gallery_item_1', '', 'Gallery image/video 1'),
('gallery_item_2', '', 'Gallery image/video 2'),
('gallery_item_3', '', 'Gallery image/video 3'),
('gallery_item_4', '', 'Gallery image/video 4'),
('gallery_item_5', '', 'Gallery image/video 5'),
('gallery_item_6', '', 'Gallery image/video 6')
ON CONFLICT (key) DO NOTHING;

-- Final verification and completion message
DO $$
DECLARE
    admin_count INTEGER;
    settings_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM admins WHERE username = 'admin';
    SELECT COUNT(*) INTO settings_count FROM settings;
    
    RAISE NOTICE 'Database initialization completed successfully!';
    RAISE NOTICE 'Admin users created: %', admin_count;
    RAISE NOTICE 'Settings records created: %', settings_count;
    
    IF admin_count = 0 THEN
        RAISE EXCEPTION 'CRITICAL: No admin user found after initialization!';
    END IF;
    
    RAISE NOTICE 'You can now log in with: username=admin, password=admin';
END $$;
