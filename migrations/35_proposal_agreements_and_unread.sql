-- Migration 35: funding agreements, and an unread marker for revised proposals.
--
-- Two unrelated-looking additions that share a migration because they land in
-- the same feature and the same deploy:
--
--   1. project_proposals.admin_seen_version_id -- which version an admin has
--      actually opened. A dossier is "unread" when its current version is not
--      the one that was seen, which is what drives the badge in the admin.
--
--   2. proposal_agreements -- the funding & implementation agreement issued
--      once a proposal is approved.
--
-- Idempotent: safe to run more than once.

-- ── 1. The unread marker ──────────────────────────────────────────────
-- A column rather than a separate "notifications" table on purpose. The
-- question being answered is "has anyone looked at the current version of this
-- dossier", which is one fact per dossier, not a stream of events. Deriving it
-- instead from status='submitted' would not work: add_revision() sets exactly
-- that status for a brand-new dossier too, so the two cases are
-- indistinguishable, and reading a dossier would have no way to clear it
-- without also changing its review state.
--
-- ON DELETE SET NULL, matching current_version_id: losing the pointer must
-- degrade to "unread", never block the delete.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'project_proposals'
           AND column_name = 'admin_seen_version_id'
    ) THEN
        ALTER TABLE project_proposals
            ADD COLUMN admin_seen_version_id INTEGER NULL;

        ALTER TABLE project_proposals
            ADD CONSTRAINT fk_project_proposals_admin_seen_version_id
            FOREIGN KEY (admin_seen_version_id)
            REFERENCES proposal_versions (id) ON DELETE SET NULL;

        RAISE NOTICE 'added project_proposals.admin_seen_version_id';
    ELSE
        RAISE NOTICE 'project_proposals.admin_seen_version_id already present';
    END IF;
END $$;

-- Existing dossiers are backfilled as ALREADY SEEN. Marking a backlog of old
-- dossiers unread on deploy day would hand the reviewer a badge full of
-- proposals that were dealt with months ago, and they would learn to ignore
-- it -- which costs more than it gains. Only revisions arriving after this
-- migration light the badge up.
UPDATE project_proposals
   SET admin_seen_version_id = current_version_id
 WHERE admin_seen_version_id IS NULL
   AND current_version_id IS NOT NULL;

-- Partial index: the badge query only ever asks for the unread ones, and in
-- steady state that is a handful of rows out of the whole table.
CREATE INDEX IF NOT EXISTS idx_project_proposals_unread
    ON project_proposals (updated_at DESC)
 WHERE admin_seen_version_id IS DISTINCT FROM current_version_id;

-- ── 2. The agreement ──────────────────────────────────────────────────
-- One row per proposal (UNIQUE proposal_id), not one per generated PDF: the
-- agreement is a living draft the reviewer edits until it is right, and the PDF
-- is rendered from it on demand -- the same pattern as the proposal PDF and the
-- donation receipt, neither of which stores a file.
--
-- version_id records WHICH submission the agreement was drawn from, so a later
-- revision cannot silently invalidate a contract that was already issued: the
-- admin can see the agreement refers to v2 while the dossier has moved to v3.
CREATE TABLE IF NOT EXISTS proposal_agreements (
    id SERIAL PRIMARY KEY,

    proposal_id INTEGER NOT NULL
        REFERENCES project_proposals (id) ON DELETE CASCADE,
    version_id INTEGER NULL
        REFERENCES proposal_versions (id) ON DELETE SET NULL,

    -- The header block of the agreement. Pre-filled from the proposal where a
    -- field maps cleanly, typed by the reviewer where it does not: the two
    -- distribution lines cannot be derived from any submitted field, and they
    -- are quoted again in sections 3, 4 and 7 of the document.
    project_title VARCHAR(300) NOT NULL,
    location VARCHAR(300) NOT NULL,
    field_representative VARCHAR(200) NOT NULL,
    approved_funding_usd NUMERIC(10, 2) NOT NULL,
    target_count INTEGER NOT NULL,
    target_label VARCHAR(120) NOT NULL,
    distribution_per_beneficiary TEXT NOT NULL,
    total_planned_distribution TEXT NOT NULL,

    -- Free text appended to "Use of Funds", for project-specific cost lines.
    extra_fund_uses TEXT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,

    -- Stamped the first time the PDF is downloaded, so the admin can tell a
    -- draft from an agreement that has actually been issued to a representative.
    issued_at TIMESTAMP NULL,

    CONSTRAINT uq_proposal_agreements_proposal UNIQUE (proposal_id),
    CONSTRAINT proposal_agreements_funding_check CHECK (approved_funding_usd >= 0),
    CONSTRAINT proposal_agreements_target_check CHECK (target_count > 0)
);

-- create_all() may have built the table from the model first (see migration 34
-- for how that happens on this deployment), in which case CREATE TABLE IF NOT
-- EXISTS above skipped everything. Add what it would have left off.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'proposal_agreements'
           AND column_name = 'approved_funding_usd'
           AND data_type <> 'numeric'
    ) THEN
        ALTER TABLE proposal_agreements
            ALTER COLUMN approved_funding_usd TYPE NUMERIC(10, 2)
                USING ROUND(approved_funding_usd::numeric, 2);
        RAISE NOTICE 'proposal_agreements.approved_funding_usd converted to NUMERIC(10,2)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_agreements'::regclass
           AND conname = 'uq_proposal_agreements_proposal'
    ) THEN
        ALTER TABLE proposal_agreements
            ADD CONSTRAINT uq_proposal_agreements_proposal UNIQUE (proposal_id);
        RAISE NOTICE 'added uq_proposal_agreements_proposal';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_agreements'::regclass
           AND conname = 'proposal_agreements_funding_check'
    ) THEN
        ALTER TABLE proposal_agreements
            ADD CONSTRAINT proposal_agreements_funding_check
            CHECK (approved_funding_usd >= 0) NOT VALID;
        ALTER TABLE proposal_agreements
            VALIDATE CONSTRAINT proposal_agreements_funding_check;
        RAISE NOTICE 'added proposal_agreements_funding_check';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_agreements'::regclass
           AND conname = 'proposal_agreements_target_check'
    ) THEN
        ALTER TABLE proposal_agreements
            ADD CONSTRAINT proposal_agreements_target_check
            CHECK (target_count > 0) NOT VALID;
        ALTER TABLE proposal_agreements
            VALIDATE CONSTRAINT proposal_agreements_target_check;
        RAISE NOTICE 'added proposal_agreements_target_check';
    END IF;
END $$;

SELECT 'Migration 35 completed successfully!' as message;
