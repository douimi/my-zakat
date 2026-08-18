-- Proposal SMS consent (10DLC / TCR compliance)
--
-- The public /submit-proposal form collects a mobile number and now also
-- offers an optional SMS opt-in checkbox. When the applicant ticks the box
-- we record proof-of-consent alongside the proposal (exact wording, IP,
-- timestamp) so we can defend any carrier / TCR audit later.
--
-- Idempotent: safe to run more than once.

ALTER TABLE project_proposals
    ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE project_proposals
    ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMP NULL;

ALTER TABLE project_proposals
    ADD COLUMN IF NOT EXISTS sms_consent_text TEXT NULL;
