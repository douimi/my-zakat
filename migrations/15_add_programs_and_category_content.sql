-- Migration 15: Add Programs table and category page content fields
-- This enables categories to have dedicated pages with editable content
-- and allows linking multiple programs to each category

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
        -- First, set a default value for any NULL category_ids
        UPDATE programs SET category_id = 1 WHERE category_id IS NULL;
        -- Then add NOT NULL constraint
        ALTER TABLE programs ALTER COLUMN category_id SET NOT NULL;
    END IF;
END $$;

-- Create indexes (will fail gracefully if columns don't exist, but they should now)
CREATE INDEX IF NOT EXISTS idx_programs_category_id ON programs(category_id);
CREATE INDEX IF NOT EXISTS idx_programs_slug ON programs(slug);
CREATE INDEX IF NOT EXISTS idx_programs_order ON programs(category_id, display_order, is_active);

-- Add unique constraint for slug
-- Drop existing unique index if it exists, then recreate
DROP INDEX IF EXISTS idx_programs_slug_unique;
CREATE UNIQUE INDEX idx_programs_slug_unique ON programs(slug);

-- Note: Foreign key constraint could be added but keeping flexible for now
-- ALTER TABLE programs ADD CONSTRAINT fk_programs_category 
--   FOREIGN KEY (category_id) REFERENCES program_categories(id) ON DELETE CASCADE;

SELECT 'Migration 15 completed successfully! Programs table created and category content fields added.' as message;

