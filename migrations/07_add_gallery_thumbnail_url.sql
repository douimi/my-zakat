-- Add thumbnail_url column to gallery_items table
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);

