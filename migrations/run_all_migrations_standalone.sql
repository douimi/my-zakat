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
-- Migration 09: Change video URL to filename
-- ========================================
SELECT 'Running Migration 09: Change video URL to filename...' as message;

ALTER TABLE stories ADD COLUMN IF NOT EXISTS video_filename VARCHAR(255);
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS video_filename VARCHAR(255);

SELECT 'Migration 09 completed successfully!' as message;

-- ========================================
-- Migration 10: Create gallery items table
-- ========================================
SELECT 'Running Migration 10: Create gallery items table...' as message;

CREATE TABLE IF NOT EXISTS gallery_items (
    id SERIAL PRIMARY KEY,
    media_filename VARCHAR(255) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_items_order ON gallery_items(display_order, is_active);

SELECT 'Migration 10 completed successfully!' as message;

-- ========================================
-- Migration 11: Create program categories table
-- ========================================
SELECT 'Running Migration 11: Create program categories table...' as message;

CREATE TABLE IF NOT EXISTS program_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    short_description TEXT,
    image_url VARCHAR(500),
    video_filename VARCHAR(255),
    impact_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_program_categories_name ON program_categories(name);
CREATE INDEX IF NOT EXISTS idx_program_categories_slug ON program_categories(slug);
CREATE INDEX IF NOT EXISTS idx_program_categories_order ON program_categories(display_order, is_active);

-- Insert default categories with detailed fictitious data
INSERT INTO program_categories (name, slug, title, description, short_description, image_url, impact_text, display_order, is_active, created_at, updated_at)
VALUES
    ('Emergency Relief', 'emergency-relief', 'Emergency Relief', 
     'Our Emergency Relief program provides immediate assistance to families facing crisis situations. We deliver essential supplies including food, clean water, medical aid, and temporary shelter to those affected by natural disasters, conflicts, and emergencies. Our rapid response teams work around the clock to ensure that help reaches those in need within 24-48 hours of a crisis. We have established partnerships with local communities and international organizations to maximize our impact and ensure efficient distribution of aid.',
     'Rapid response assistance for families in crisis situations, delivering essential supplies and support when it matters most.',
     'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=600&fit=crop',
     'Helped 15,000+ families in crisis this year', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Water', 'water', 'Clean Water Initiative', 
     'Access to clean, safe drinking water is a fundamental human right. Our Water program focuses on building sustainable water infrastructure in underserved communities. We construct deep wells, install water filtration systems, and provide water storage solutions. Our team also conducts hygiene education workshops to ensure communities understand the importance of clean water practices. Each well we build serves an average of 500 people and provides water for 20+ years. We maintain ongoing relationships with communities to ensure the long-term sustainability of our water projects.',
     'Building sustainable water infrastructure and providing clean, safe drinking water to communities in need.',
     'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
     'Built 120+ wells serving 60,000+ people', 2, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Orphan Care', 'orphan-care', 'Orphan Care & Support', 
     'Our Orphan Care program provides comprehensive support to orphaned and vulnerable children. We ensure access to quality education, healthcare, nutritious meals, and safe housing. Our dedicated team of caregivers and counselors provides emotional support and mentorship to help children heal and thrive. We also support foster families and work to create loving, stable environments for children. Our program includes scholarship opportunities, vocational training for older children, and ongoing support until they reach independence. We believe every child deserves a chance at a bright future.',
     'Comprehensive support for orphaned children including education, healthcare, emotional support, and safe housing.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
     'Supporting 850+ orphaned children with education and care', 3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Food Security', 'food-security', 'Food Security & Nutrition', 
     'Our Food Security program addresses hunger and malnutrition through multiple initiatives. We operate food distribution centers that provide monthly food packages to families in need, including rice, grains, cooking oil, and nutritious staples. We also run community gardens and agricultural training programs to help families grow their own food sustainably. Our nutrition programs specifically target children and pregnant women, providing fortified foods and nutritional supplements. During Ramadan and other special occasions, we organize large-scale food distribution events, ensuring that everyone can celebrate with dignity.',
     'Ensuring families have access to nutritious food through distribution programs, community gardens, and nutrition initiatives.',
     'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
     'Distributed 2.5M+ meals and supported 8,000+ families', 4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Education', 'education', 'Education for All', 
     'Education is the foundation for breaking the cycle of poverty. Our Education program builds and supports schools in underserved areas, provides scholarships to deserving students, and supplies educational materials including books, computers, and learning resources. We train teachers and support educational infrastructure development. Our program includes adult literacy classes, vocational training programs, and university scholarships. We also provide after-school tutoring and mentorship programs to help students succeed. Our goal is to ensure that every child, regardless of their circumstances, has access to quality education.',
     'Supporting educational opportunities for children and adults through schools, scholarships, and educational resources.',
     'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
     'Built 25 schools and provided 3,200+ scholarships', 5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Helping Families', 'helping-families', 'Family Support & Development', 
     'Our Helping Families program provides comprehensive support to families facing various challenges. We offer housing assistance for families in need of safe, affordable shelter. Our healthcare initiatives provide medical check-ups, vaccinations, and access to essential medicines. We run livelihood programs that teach skills and provide micro-loans to help families start small businesses. Our family counseling services help resolve conflicts and strengthen family bonds. We also provide emergency financial assistance for families facing unexpected crises. Through our network of community centers, we offer a safe space where families can access resources, support, and guidance.',
     'Comprehensive family support including housing assistance, healthcare, livelihood programs, and emergency aid.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
     'Supported 12,000+ families with housing, healthcare, and livelihood programs', 6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    short_description = EXCLUDED.short_description,
    image_url = EXCLUDED.image_url,
    impact_text = EXCLUDED.impact_text,
    updated_at = CURRENT_TIMESTAMP;

UPDATE program_categories 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

UPDATE program_categories 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL;

SELECT 'Migration 11 completed successfully!' as message;

-- ========================================
-- Migration 12: Cleanup program settings
-- ========================================
SELECT 'Running Migration 12: Cleanup program settings...' as message;

DELETE FROM settings 
WHERE key IN (
    'program_title_1', 'program_title_2', 'program_title_3',
    'program_description_1', 'program_description_2', 'program_description_3',
    'program_image_1', 'program_image_2', 'program_image_3',
    'program_video_1', 'program_video_2', 'program_video_3',
    'program_impact_1', 'program_impact_2', 'program_impact_3'
);

SELECT 'Migration 12 completed successfully!' as message;

-- ========================================
-- Migration 13: Comprehensive cleanup
-- ========================================
SELECT 'Running Migration 13: Comprehensive cleanup...' as message;

-- Verify program_categories indexes exist
CREATE INDEX IF NOT EXISTS idx_program_categories_name ON program_categories(name);
CREATE INDEX IF NOT EXISTS idx_program_categories_slug ON program_categories(slug);
CREATE INDEX IF NOT EXISTS idx_program_categories_order ON program_categories(display_order, is_active);

SELECT 'Migration 13 completed successfully!' as message;

-- ========================================
-- Migration 14: Add category slideshow content
-- ========================================
SELECT 'Running Migration 14: Add category slideshow content...' as message;

-- Insert slideshow slides for all program categories
INSERT INTO slideshow_slides (title, description, image_url, cta_text, cta_url, display_order, is_active, created_at, updated_at)
VALUES
    -- Emergency Relief slides
    ('Emergency Relief - Rapid Response', 
     'Our emergency response teams deliver essential supplies within 24-48 hours of a crisis. Help us be ready when disaster strikes.',
     'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1200&h=600&fit=crop',
     'Support Emergency Relief',
     '/donate?category=emergency-relief',
     1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Emergency Relief - Essential Supplies', 
     'We provide food, clean water, medical aid, and temporary shelter to families affected by emergencies.',
     'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=emergency-relief',
     2, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Water slides
    ('Clean Water Initiative', 
     'Every well we build serves 500+ people for 20+ years. Help us bring clean water to communities in need.',
     'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&h=600&fit=crop',
     'Support Water Projects',
     '/donate?category=water',
     3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Sustainable Water Solutions', 
     'We build wells, install filtration systems, and provide water storage solutions to ensure long-term access to clean water.',
     'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=water',
     4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Orphan Care slides
    ('Orphan Care - Building Bright Futures', 
     'We provide education, healthcare, and emotional support to orphaned children. Help us give them the future they deserve.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&h=600&fit=crop',
     'Support Orphan Care',
     '/donate?category=orphan-care',
     5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Comprehensive Child Support', 
     'Our program includes education, healthcare, nutritious meals, safe housing, and mentorship for orphaned children.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=orphan-care',
     6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Food Security slides
    ('Food Security - Fighting Hunger', 
     'We distribute nutritious food packages and run community gardens to ensure families have access to healthy meals.',
     'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=600&fit=crop',
     'Support Food Programs',
     '/donate?category=food-security',
     7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Nutrition for All', 
     'Our food security programs reach thousands of families monthly, providing essential nutrition and teaching sustainable farming.',
     'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=food-security',
     8, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Education slides
    ('Education for All', 
     'We build schools, provide scholarships, and supply educational materials to ensure every child has access to quality education.',
     'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&h=600&fit=crop',
     'Support Education',
     '/donate?category=education',
     9, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Building Tomorrow''s Leaders', 
     'Through schools, scholarships, and educational resources, we''re empowering the next generation to break the cycle of poverty.',
     'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=education',
     10, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Helping Families slides
    ('Helping Families Thrive', 
     'We provide housing assistance, healthcare, livelihood programs, and emergency support to help families overcome challenges.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&h=600&fit=crop',
     'Support Families',
     '/donate?category=helping-families',
     11, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Comprehensive Family Support', 
     'From housing to healthcare, from skills training to emergency aid - we''re here to support families every step of the way.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=helping-families',
     12, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT DO NOTHING;

-- Update display order to ensure proper sequencing
UPDATE slideshow_slides SET display_order = id WHERE display_order = 0 OR display_order IS NULL;

SELECT 'Migration 14 completed successfully!' as message;

-- ========================================
-- Migration 15: Add Programs table and category page content fields
-- ========================================
SELECT 'Running Migration 15: Add Programs table and category page content fields...' as message;

-- Add page content fields to program_categories table
ALTER TABLE program_categories 
ADD COLUMN IF NOT EXISTS html_content TEXT,
ADD COLUMN IF NOT EXISTS css_content TEXT,
ADD COLUMN IF NOT EXISTS js_content TEXT,
ADD COLUMN IF NOT EXISTS category_slideshow_id INTEGER;

-- Create programs table if it doesn't exist
CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    short_description TEXT,
    image_url VARCHAR(500),
    video_filename VARCHAR(255),
    html_content TEXT,
    css_content TEXT,
    js_content TEXT,
    impact_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to programs table if it already existed
DO $$ 
BEGIN
    -- Add category_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='category_id') THEN
        ALTER TABLE programs ADD COLUMN category_id INTEGER;
    END IF;
    
    -- Add other columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='title') THEN
        ALTER TABLE programs ADD COLUMN title VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='slug') THEN
        ALTER TABLE programs ADD COLUMN slug VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='description') THEN
        ALTER TABLE programs ADD COLUMN description TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='short_description') THEN
        ALTER TABLE programs ADD COLUMN short_description TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='image_url') THEN
        ALTER TABLE programs ADD COLUMN image_url VARCHAR(500);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='video_filename') THEN
        ALTER TABLE programs ADD COLUMN video_filename VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='html_content') THEN
        ALTER TABLE programs ADD COLUMN html_content TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='css_content') THEN
        ALTER TABLE programs ADD COLUMN css_content TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='js_content') THEN
        ALTER TABLE programs ADD COLUMN js_content TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='impact_text') THEN
        ALTER TABLE programs ADD COLUMN impact_text VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='display_order') THEN
        ALTER TABLE programs ADD COLUMN display_order INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='is_active') THEN
        ALTER TABLE programs ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='created_at') THEN
        ALTER TABLE programs ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='programs' AND column_name='updated_at') THEN
        ALTER TABLE programs ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Set NOT NULL constraint on category_id if it exists and is nullable
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='programs' AND column_name='category_id' AND is_nullable='YES') THEN
        -- First, set a default value for any NULL category_ids (use first category or 1)
        UPDATE programs SET category_id = (SELECT MIN(id) FROM program_categories LIMIT 1) 
        WHERE category_id IS NULL AND EXISTS (SELECT 1 FROM program_categories);
        -- If no categories exist, set to 1 (will need to be fixed manually)
        UPDATE programs SET category_id = 1 WHERE category_id IS NULL;
        -- Then add NOT NULL constraint
        ALTER TABLE programs ALTER COLUMN category_id SET NOT NULL;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_programs_category_id ON programs(category_id);
CREATE INDEX IF NOT EXISTS idx_programs_slug ON programs(slug);
CREATE INDEX IF NOT EXISTS idx_programs_order ON programs(category_id, display_order, is_active);

-- Add unique constraint for slug
DROP INDEX IF EXISTS idx_programs_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_slug_unique ON programs(slug);

SELECT 'Migration 15 completed successfully!' as message;

-- ========================================
-- Migration 16: Populate Programs table
-- ========================================
SELECT 'Running Migration 16: Populate Programs table...' as message;

-- Insert programs for Emergency Relief category
INSERT INTO programs (category_id, title, slug, description, short_description, image_url, impact_text, display_order, is_active, created_at, updated_at)
SELECT 
    id,
    'Rapid Response Team',
    'rapid-response-team',
    'Our Rapid Response Team deploys within 24-48 hours of a crisis to deliver immediate aid. We provide emergency food packages, clean water, medical supplies, temporary shelter, and essential hygiene items. Our trained volunteers work with local partners to ensure aid reaches those most in need quickly and efficiently.',
    'Deploying within 24-48 hours to deliver immediate emergency aid and supplies to crisis-affected communities.',
    'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=600&fit=crop',
    'Responded to 45+ emergencies this year',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'emergency-relief'

UNION ALL

SELECT 
    id,
    'Disaster Relief Fund',
    'disaster-relief-fund',
    'The Disaster Relief Fund provides flexible funding for immediate response to natural disasters, conflicts, and humanitarian crises. Funds are used for emergency shelter, food distribution, medical care, and rebuilding efforts. We work with trusted local organizations to ensure aid reaches affected communities quickly.',
    'Flexible funding for immediate disaster response and recovery efforts worldwide.',
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=800&h=600&fit=crop',
    'Supported 12,000+ families in crisis',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'emergency-relief'

UNION ALL

-- Insert programs for Water category
SELECT 
    id,
    'Well Construction Project',
    'well-construction-project',
    'We build deep, sustainable wells in communities without access to clean water. Each well serves an average of 500 people and provides water for 20+ years. Our team conducts geological surveys, works with local engineers, and trains community members to maintain the wells long-term.',
    'Building sustainable deep wells that provide clean water for 500+ people for 20+ years.',
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    'Built 85+ wells serving 42,500+ people',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

SELECT 
    id,
    'Water Filtration Systems',
    'water-filtration-systems',
    'We install and maintain water filtration systems in schools, mosques, and community centers. These systems purify contaminated water sources, making them safe for drinking and cooking. We provide training on system maintenance and water hygiene practices.',
    'Installing filtration systems to purify water sources in schools and community centers.',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
    'Installed 200+ filtration systems',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

SELECT 
    id,
    'Water Storage Solutions',
    'water-storage-solutions',
    'We provide water storage tanks and containers to communities, enabling them to store clean water safely. This is especially important in areas with intermittent water supply or during dry seasons. We also train communities on water conservation and storage best practices.',
    'Providing water storage solutions to ensure communities have access to clean water year-round.',
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    'Provided storage to 150+ communities',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

-- Insert programs for Orphan Care category
SELECT 
    id,
    'Orphan Sponsorship Program',
    'orphan-sponsorship-program',
    'Our sponsorship program connects donors with orphaned children, providing monthly support for education, healthcare, food, clothing, and other essential needs. Sponsors receive regular updates about their sponsored child''s progress. We ensure children receive quality education and emotional support.',
    'Monthly sponsorship program providing education, healthcare, and essential support for orphaned children.',
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
    'Supporting 650+ orphaned children',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

SELECT 
    id,
    'Orphanage Support',
    'orphanage-support',
    'We partner with orphanages to improve living conditions, provide educational resources, and ensure children receive proper nutrition and healthcare. Our support includes infrastructure improvements, educational materials, medical check-ups, and training for caregivers.',
    'Comprehensive support for orphanages including infrastructure, education, and healthcare improvements.',
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
    'Supporting 15+ orphanages',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

SELECT 
    id,
    'Educational Scholarships for Orphans',
    'educational-scholarships-orphans',
    'We provide full scholarships for orphaned children to attend quality schools, covering tuition, books, uniforms, and school supplies. Scholarships are available from primary school through university. We also provide tutoring and mentorship to help children succeed academically.',
    'Full educational scholarships from primary school through university for orphaned children.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Awarded 180+ scholarships',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

-- Insert programs for Food Security category
SELECT 
    id,
    'Monthly Food Distribution',
    'monthly-food-distribution',
    'We operate food distribution centers that provide monthly food packages to families in need. Each package includes rice, grains, cooking oil, lentils, and other nutritious staples. We serve thousands of families monthly, ensuring they have access to essential nutrition.',
    'Monthly food packages providing essential nutrition to families in need.',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
    'Distributing 1.8M+ meals monthly',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Community Gardens Initiative',
    'community-gardens-initiative',
    'We help communities establish and maintain community gardens, providing seeds, tools, training, and ongoing support. These gardens provide fresh produce for families and create sustainable food sources. We teach sustainable farming techniques and water conservation methods.',
    'Establishing community gardens to create sustainable food sources and teach farming skills.',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop',
    'Established 50+ community gardens',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Ramadan Food Packages',
    'ramadan-food-packages',
    'During Ramadan, we distribute special food packages to help families break their fasts with nutritious meals. Packages include dates, rice, meat, vegetables, and other traditional foods. We also organize community iftar meals, bringing families together during this blessed month.',
    'Special Ramadan food packages and community iftar meals for families in need.',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
    'Distributed 25,000+ Ramadan packages',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Nutrition for Children',
    'nutrition-for-children',
    'Our child nutrition program provides fortified foods and nutritional supplements to children under 5 and pregnant women. We conduct nutrition education workshops for mothers and provide regular health check-ups. This program addresses malnutrition and ensures healthy development.',
    'Fortified foods and nutritional support for children and pregnant women.',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop',
    'Supporting 3,500+ children',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

-- Insert programs for Education category
SELECT 
    id,
    'School Construction',
    'school-construction',
    'We build and renovate schools in underserved areas, providing safe learning environments for children. Our schools include classrooms, libraries, computer labs, and playgrounds. We work with local communities to ensure schools are maintained and properly staffed.',
    'Building and renovating schools to provide quality learning environments for children.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Built 18 schools serving 8,000+ students',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Student Scholarship Program',
    'student-scholarship-program',
    'We provide scholarships to deserving students who cannot afford school fees. Scholarships cover tuition, books, uniforms, and other educational expenses. We support students from primary school through university, helping them achieve their educational goals.',
    'Comprehensive scholarships covering tuition and educational expenses for deserving students.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Awarded 2,400+ scholarships',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Educational Resources & Supplies',
    'educational-resources-supplies',
    'We provide schools and students with essential educational resources including textbooks, notebooks, stationery, computers, and learning materials. We also establish libraries and computer labs to enhance learning opportunities for students.',
    'Providing textbooks, computers, and learning materials to schools and students.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Supplied 50+ schools with resources',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Adult Literacy Program',
    'adult-literacy-program',
    'We offer free literacy classes for adults who missed out on education. Classes are held in community centers and mosques, making them accessible to everyone. We teach reading, writing, basic math, and practical life skills. Graduates receive certificates and ongoing support.',
    'Free literacy classes teaching reading, writing, and life skills to adults.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Taught 1,200+ adults to read and write',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Vocational Training',
    'vocational-training',
    'We provide vocational training programs teaching practical skills such as carpentry, tailoring, computer skills, and small business management. These programs help individuals gain employment or start their own businesses, improving their economic situation.',
    'Practical skills training for employment and entrepreneurship opportunities.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Trained 800+ individuals',
    5,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

-- Insert programs for Helping Families category
SELECT 
    id,
    'Housing Assistance Program',
    'housing-assistance-program',
    'We provide housing assistance to families in need, including rent support, home repairs, and construction of new homes for those without adequate shelter. We work with families to improve their living conditions and ensure they have safe, secure housing.',
    'Supporting families with rent assistance, home repairs, and new home construction.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Assisted 450+ families with housing',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Family Healthcare Initiative',
    'family-healthcare-initiative',
    'We provide free medical check-ups, vaccinations, and essential medicines to families who cannot afford healthcare. We organize health camps in underserved areas and partner with local clinics to provide ongoing care. We also conduct health education workshops.',
    'Free medical check-ups, vaccinations, and essential medicines for families in need.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Provided healthcare to 5,000+ families',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Livelihood & Skills Training',
    'livelihood-skills-training',
    'We provide skills training and micro-loans to help families start small businesses and become self-sufficient. Training includes business management, financial literacy, and practical skills. We support entrepreneurs with mentorship and access to markets.',
    'Skills training and micro-loans to help families start businesses and become self-sufficient.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Supported 600+ small businesses',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Emergency Family Support',
    'emergency-family-support',
    'We provide emergency financial assistance to families facing unexpected crises such as medical emergencies, job loss, or natural disasters. Support includes cash assistance, essential supplies, and counseling services. We help families get back on their feet during difficult times.',
    'Emergency financial assistance and support for families facing unexpected crises.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Assisted 1,200+ families in emergencies',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Family Counseling Services',
    'family-counseling-services',
    'We provide free family counseling services to help resolve conflicts, strengthen family bonds, and support mental health. Our trained counselors work with families to address issues such as domestic violence, substance abuse, and family disputes. Services are confidential and culturally sensitive.',
    'Free counseling services to strengthen family bonds and resolve conflicts.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Counseled 800+ families',
    5,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

ON CONFLICT (slug) DO NOTHING;

-- Update timestamps
UPDATE programs 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL OR updated_at < created_at;

SELECT 'Migration 16 completed successfully! Programs populated and linked to categories.' as message;

-- ========================================
-- Migration 17: Fix NULL slugs in programs table
-- ========================================
SELECT 'Running Migration 17: Fix NULL slugs in programs table...' as message;

-- Update programs with NULL slugs by generating slugs from their titles
UPDATE programs
SET slug = LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(title, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
))
WHERE slug IS NULL OR slug = '';

-- Handle any remaining edge cases where slug might still be empty
UPDATE programs
SET slug = 'program-' || id::text
WHERE slug IS NULL OR slug = '';

-- Ensure all slugs are unique by appending numbers if needed
DO $$
DECLARE
    prog RECORD;
    new_slug TEXT;
    counter INTEGER;
    duplicate_slug TEXT;
BEGIN
    -- Find all duplicate slugs
    FOR duplicate_slug IN 
        SELECT slug 
        FROM programs 
        WHERE slug IS NOT NULL AND slug != ''
        GROUP BY slug 
        HAVING COUNT(*) > 1
    LOOP
        -- Process each program with this duplicate slug (skip the first one)
        counter := 1;
        FOR prog IN 
            SELECT id, slug, title 
            FROM programs 
            WHERE slug = duplicate_slug
            ORDER BY id
            OFFSET 1  -- Skip the first one, keep its slug
        LOOP
            new_slug := duplicate_slug || '-' || counter::text;
            
            -- Make sure the new slug doesn't conflict with existing ones
            WHILE EXISTS (SELECT 1 FROM programs WHERE slug = new_slug) LOOP
                counter := counter + 1;
                new_slug := duplicate_slug || '-' || counter::text;
            END LOOP;
            
            UPDATE programs SET slug = new_slug WHERE id = prog.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;
END $$;

SELECT 'Migration 17 completed successfully! All program slugs have been fixed.' as message;

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

