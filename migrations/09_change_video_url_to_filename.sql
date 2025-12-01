-- Migration 09: Change video_url to video_filename for uploaded videos
-- This migration changes video storage from external URLs to uploaded files

-- Add video_filename column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS video_filename VARCHAR(255);

-- Migrate existing data: if video_url is a local path, copy to video_filename
-- Otherwise, leave video_filename NULL (external URLs will be removed)
UPDATE stories 
SET video_filename = REPLACE(video_url, '/api/uploads/stories/', '')
WHERE video_url IS NOT NULL 
  AND video_url LIKE '/api/uploads/stories/%';

-- Drop video_url column after migration
ALTER TABLE stories DROP COLUMN IF EXISTS video_url;

-- Add video_filename column to testimonials table
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS video_filename VARCHAR(255);

-- Migrate existing data: if video_url is a local path, copy to video_filename
UPDATE testimonials 
SET video_filename = REPLACE(video_url, '/api/uploads/testimonials/', '')
WHERE video_url IS NOT NULL 
  AND video_url LIKE '/api/uploads/testimonials/%';

-- Drop video_url column after migration
ALTER TABLE testimonials DROP COLUMN IF EXISTS video_url;

SELECT 'Migration 09 completed successfully! Video URLs changed to video filenames.' as message;

