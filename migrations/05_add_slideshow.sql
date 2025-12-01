-- Migration 05: Add slideshow slides table and sticky donation bar setting
-- Run this script to add slideshow functionality

-- Create slideshow_slides table
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

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_slideshow_slides_order ON slideshow_slides(display_order, is_active);

-- Add sticky donation bar setting
INSERT INTO settings (key, value, description) VALUES
('sticky_donation_bar_enabled', 'false', 'Enable or disable the sticky donation bar on the homepage')
ON CONFLICT (key) DO NOTHING;

SELECT 'Migration 05 completed successfully!' as message;

