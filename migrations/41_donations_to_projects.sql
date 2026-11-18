-- Migration 41: a donation can be given to a fundraising project.
--
-- Until now a donor could only name a project as free text (the "purpose"),
-- and an admin moved the project's raised total by hand. Now a donation
-- carries the project it was given to, and the project's raised total is
-- computed from those donations plus `fundraising_projects.spent_cents`,
-- which keeps holding what was raised outside linked donations (cash before
-- this change, earlier campaigns). Computed, not incremented: a donation that
-- is deleted or corrected can never leave the total wrong.
--
-- A recurring gift carries the project on its subscription, and every monthly
-- charge inherits it.
--
-- ON DELETE SET NULL: deleting a project must never delete money records.
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

ALTER TABLE donations ADD COLUMN IF NOT EXISTS fundraising_project_id INTEGER NULL;
ALTER TABLE donation_subscriptions ADD COLUMN IF NOT EXISTS fundraising_project_id INTEGER NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_donations_fundraising_project') THEN
        ALTER TABLE donations ADD CONSTRAINT fk_donations_fundraising_project
            FOREIGN KEY (fundraising_project_id) REFERENCES fundraising_projects (id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_donation_subscriptions_fundraising_project') THEN
        ALTER TABLE donation_subscriptions ADD CONSTRAINT fk_donation_subscriptions_fundraising_project
            FOREIGN KEY (fundraising_project_id) REFERENCES fundraising_projects (id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_donations_fundraising_project
    ON donations (fundraising_project_id) WHERE fundraising_project_id IS NOT NULL;

SELECT 'Migration 41 completed successfully!' as message;
