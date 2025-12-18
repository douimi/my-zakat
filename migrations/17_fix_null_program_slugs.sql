-- Migration 17: Fix NULL slugs in programs table
-- This ensures all programs have valid slugs

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

-- Verify no NULL slugs remain
SELECT COUNT(*) as null_slugs FROM programs WHERE slug IS NULL OR slug = '';

SELECT 'Migration 17 completed successfully! All program slugs have been fixed.' as message;

