-- Migration 37: file media under the project it documents.
--
-- The library was organised by workspace — whose media it is. That answers a
-- question about staffing, not about the work: nobody looks for "Omar's
-- photos", they look for "the rice distribution photos". This adds the missing
-- link so the library can be browsed as a folder per project.
--
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

-- ── The link ──────────────────────────────────────────────────────────
-- Nullable, and NULL is a real state, not a defect: every asset already in the
-- library has no project, and they land in an "Unassigned" folder rather than
-- being force-fitted to a guess.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a proposal must never delete
-- photographs of work that actually happened — the media outlives the dossier
-- that justified it, and the bytes are the only record of the distribution.
--
-- One project per asset (a column, not a join table): a folder view needs a
-- single home per file, or the same photo appears in two folders and the counts
-- stop adding up.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'media_assets' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE media_assets ADD COLUMN project_id INTEGER NULL;

        ALTER TABLE media_assets
            ADD CONSTRAINT fk_media_assets_project_id
            FOREIGN KEY (project_id)
            REFERENCES project_proposals (id) ON DELETE SET NULL;

        RAISE NOTICE 'added media_assets.project_id';
    ELSE
        RAISE NOTICE 'media_assets.project_id already present';
    END IF;
END $$;

-- The folder listing groups by project and counts photos and videos per
-- project, so this index carries media_type as its second column: the grouping
-- is then served from the index alone.
--
-- Partial, excluding NULL: the Unassigned folder is one count over everything
-- else and gains nothing from being indexed, while in steady state the vast
-- majority of rows are expected to carry a project.
CREATE INDEX IF NOT EXISTS idx_media_assets_project
    ON media_assets (project_id, media_type)
 WHERE project_id IS NOT NULL;

SELECT 'Migration 37 completed successfully!' as message;
