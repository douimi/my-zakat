-- Migration 33: drop the project_proposals columns that moved to
-- proposal_versions in migration 32.
--
-- DESTRUCTIVE. Apply it only once BOTH are true:
--   * migration 32 ran and its backfill was verified — every proposal has a
--     version 1 and a current_version_id (query below);
--   * the backend image serving traffic is the one that reads content from
--     proposal_versions. The previous image still writes these columns.
--
-- Verify before running:
--   SELECT count(*) FROM project_proposals WHERE current_version_id IS NULL;
--   -- must return 0
--
-- Idempotent: safe to run more than once.

ALTER TABLE project_proposals DROP COLUMN IF EXISTS national_id;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS date_of_birth_year;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS place_of_residence;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS mobile_number;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS educational_level;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS project_name;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS project_description;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS problem_solved;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS target_beneficiaries;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS community_impact;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_impact;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS implementation_steps;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS implementation_location;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS required_materials;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_duration;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS continuity_plan;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS feasibility;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_challenges;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS number_of_beneficiaries;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS cost_per_unit_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS unit_type;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS additional_expenses_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS additional_expenses_description;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS total_amount_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS admin_notes;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS submitted_ip;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent_at;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent_text;

-- full_name stays: the dossier keeps it denormalised for the admin list, and
-- the service rewrites it on every new version.
ALTER TABLE project_proposals ALTER COLUMN full_name SET NOT NULL;

SELECT 'Migration 33 completed successfully!' as message;
