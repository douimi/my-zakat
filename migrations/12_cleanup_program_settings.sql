-- Migration 12: Cleanup unused program settings
-- This removes the old program_title_1, program_description_1, etc. settings
-- that have been replaced by the program_categories table

-- Delete old program settings
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

-- Note: We keep the settings table itself as it's still used for other settings
-- We only remove the program-specific settings that are now managed through program_categories

SELECT 'Migration 12 completed successfully! Old program settings removed.' as message;

