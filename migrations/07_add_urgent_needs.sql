-- Migration 07: Add urgent_needs table for dynamic urgent cause pages
-- This allows admins to create and manage urgent need pages with custom HTML/CSS/JS content

-- Create urgent_needs table
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

-- Create index for ordering and active status
CREATE INDEX IF NOT EXISTS idx_urgent_needs_order ON urgent_needs(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_urgent_needs_slug ON urgent_needs(slug);

SELECT 'Migration 07 completed successfully!' as message;

