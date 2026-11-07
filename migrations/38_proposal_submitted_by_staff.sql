-- Migration 38: record when staff submitted on a team's behalf.
--
-- An admin can now open the submitter portal as a dossier's applicant, to
-- unblock a team that cannot sign in (lost access to the mailbox, codes not
-- arriving, no idea where to go), and file the report or revision for them.
-- What gets filed that way must say so: a report is the team's account of how
-- the money was spent, and "the team wrote this" and "an admin typed it in from
-- a WhatsApp message" are different facts.
--
-- The staff member's email, not a user id: the record must survive that
-- account being deleted, and it is read by people, not joined.
--
-- NULL means the team filed it themselves, which is every existing row.
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS submitted_by_staff VARCHAR(255) NULL;
ALTER TABLE proposal_reports  ADD COLUMN IF NOT EXISTS submitted_by_staff VARCHAR(255) NULL;

SELECT 'Migration 38 completed successfully!' as message;
