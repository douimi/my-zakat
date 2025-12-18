-- Migration 13: Comprehensive cleanup of unused tables and columns
-- This script removes deprecated tables and columns that are no longer needed

-- ============================================
-- PART 1: Remove old program settings
-- ============================================
-- These settings have been replaced by the program_categories table
DELETE FROM settings 
WHERE key IN (
    'program_title_1',
    'program_title_2',
    'program_title_3',
    'program_description_1',
    'program_description_2',
    'program_description_3',
    'program_image_1',
    'program_image_2',
    'program_image_3',
    'program_video_1',
    'program_video_2',
    'program_video_3',
    'program_impact_1',
    'program_impact_2',
    'program_impact_3'
);

-- ============================================
-- PART 2: Check for and remove deprecated tables
-- ============================================
-- Note: Only drop tables if they exist and are confirmed to be unused
-- Uncomment the following if you're sure these tables are not needed:

-- DROP TABLE IF EXISTS press_releases CASCADE;
-- Note: press_releases table exists in models.py but may not be used
-- Check your application before uncommenting

-- ============================================
-- PART 3: Remove deprecated columns (if any)
-- ============================================
-- Check for deprecated columns in existing tables

-- Example: If slideshow_slides.image_filename is deprecated in favor of image_url
-- ALTER TABLE slideshow_slides DROP COLUMN IF EXISTS image_filename;
-- Note: Currently keeping image_filename for backward compatibility
-- Uncomment when you're sure all data has been migrated

-- ============================================
-- PART 4: Clean up orphaned data
-- ============================================
-- Remove any orphaned gallery items that reference non-existent media files
-- (This is optional and should be run carefully)

-- ============================================
-- PART 5: Update indexes (if needed)
-- ============================================
-- Ensure indexes are optimized for the new structure

-- Verify program_categories indexes exist
CREATE INDEX IF NOT EXISTS idx_program_categories_name ON program_categories(name);
CREATE INDEX IF NOT EXISTS idx_program_categories_slug ON program_categories(slug);
CREATE INDEX IF NOT EXISTS idx_program_categories_order ON program_categories(display_order, is_active);

-- ============================================
-- Summary
-- ============================================
SELECT 
    'Migration 13 completed successfully!' as message,
    (SELECT COUNT(*) FROM settings WHERE key LIKE 'program_%') as remaining_program_settings,
    (SELECT COUNT(*) FROM program_categories) as total_categories;

-- Expected results:
-- remaining_program_settings should be 0
-- total_categories should be 6 (the default categories)

