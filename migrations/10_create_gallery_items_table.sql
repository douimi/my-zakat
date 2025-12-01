-- Migration 10: Create gallery_items table for unlimited gallery items
-- This replaces the gallery_item_1 through gallery_item_6 settings

CREATE TABLE IF NOT EXISTS gallery_items (
    id SERIAL PRIMARY KEY,
    media_filename VARCHAR(255) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_gallery_items_order ON gallery_items(display_order, is_active);

-- Migrate existing gallery items from settings to the new table
DO $$
DECLARE
    item_value TEXT;
    item_order INTEGER := 1;
BEGIN
    FOR i IN 1..6 LOOP
        SELECT value INTO item_value 
        FROM settings 
        WHERE key = 'gallery_item_' || i;
        
        IF item_value IS NOT NULL AND item_value != '' THEN
            INSERT INTO gallery_items (media_filename, display_order, is_active, created_at, updated_at)
            VALUES (item_value, item_order, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING;
            item_order := item_order + 1;
        END IF;
    END LOOP;
END $$;

-- Update any existing records that might have NULL datetime values
UPDATE gallery_items 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

UPDATE gallery_items 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL;

SELECT 'Migration 10 completed successfully! Gallery items table created and data migrated.' as message;

