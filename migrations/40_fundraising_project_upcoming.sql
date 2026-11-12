-- Migration 40: upcoming fundraising projects.
--
-- A project can now be announced before it opens for donations
-- (status = 'upcoming'), so that when nothing is open the site shows what is
-- coming next instead of a dead end. `starts_at` is the date it is expected to
-- open; optional, because a project is often announced before its date is fixed.
--
-- `status` is VARCHAR(20) with no CHECK constraint (migration 28), so the new
-- value needs no schema change; only the date is new.
--
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

ALTER TABLE fundraising_projects ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP NULL;

SELECT 'Migration 40 completed successfully!' as message;
