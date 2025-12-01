-- Migration 06: Add image_url column to slideshow_slides table
-- This allows using image URLs instead of just uploaded files

-- Add image_url column
ALTER TABLE slideshow_slides ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

SELECT 'Migration 06 completed successfully!' as message;

