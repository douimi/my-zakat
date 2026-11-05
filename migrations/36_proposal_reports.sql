-- Migration 36: the completion report, and the statuses around it.
--
-- A funded project has to be reported on before the team may ask for anything
-- else. That adds four statuses to project_proposals and two tables: one
-- append-only row per report submission, and its attachments.
--
-- Idempotent: safe to run more than once.

-- ── 1. Room for the new status names ──────────────────────────────────
-- `status` is VARCHAR(20) and 'report_changes_requested' is 24 characters, so
-- without this the INSERT fails outright with "value too long for type
-- character varying(20)". There is no CHECK constraint on the column, so the
-- new names need nothing else — only the width.
--
-- 32 rather than 24: the next status after these should not need a migration.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'project_proposals'
           AND column_name = 'status'
           AND character_maximum_length < 32
    ) THEN
        ALTER TABLE project_proposals ALTER COLUMN status TYPE VARCHAR(32);
        RAISE NOTICE 'project_proposals.status widened to VARCHAR(32)';
    ELSE
        RAISE NOTICE 'project_proposals.status already wide enough';
    END IF;
END $$;

-- ── 2. One row per report submission ──────────────────────────────────
-- Append-only, exactly like proposal_versions: a report the admin sent back
-- for correction stays readable beside the one that replaced it, so the
-- comment on report 1 is visibly what caused report 2.
CREATE TABLE IF NOT EXISTS proposal_reports (
    id SERIAL PRIMARY KEY,

    proposal_id INTEGER NOT NULL
        REFERENCES project_proposals (id) ON DELETE CASCADE,
    report_no INTEGER NOT NULL,

    -- Free narrative. The contract's section 7 lists what it should cover
    -- (beneficiaries served, quantities, actual spend, unused funds, variance)
    -- but it is deliberately not broken into columns: the projects differ too
    -- much for a fixed schema to fit them, and the figures that matter are
    -- already fixed in proposal_agreements.
    narrative TEXT NOT NULL,

    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    submitted_ip VARCHAR(45) NULL,

    -- NULL = awaiting review | approved | changes_requested
    decision VARCHAR(20) NULL,
    decision_comment TEXT NULL,       -- shown to the team
    internal_note TEXT NULL,          -- staff only
    decided_at TIMESTAMP NULL,
    decided_by INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,

    CONSTRAINT uq_proposal_report_no UNIQUE (proposal_id, report_no),
    CONSTRAINT proposal_reports_report_no_check CHECK (report_no > 0),
    CONSTRAINT proposal_reports_decision_check
        CHECK (decision IS NULL OR decision IN ('approved', 'changes_requested'))
);

-- ── 3. Attachments ────────────────────────────────────────────────────
-- Receipts, invoices, photographs and video. The bytes live in S3 under
-- `object_key`; only the metadata is here, which is how the rest of this
-- schema treats uploaded media.
CREATE TABLE IF NOT EXISTS proposal_report_attachments (
    id SERIAL PRIMARY KEY,

    report_id INTEGER NOT NULL
        REFERENCES proposal_reports (id) ON DELETE CASCADE,

    -- As the uploader named it, for display and download only. Never used to
    -- build a path: object_key is generated server-side.
    filename VARCHAR(255) NOT NULL,
    object_key VARCHAR(500) NOT NULL,

    -- The type the BYTES sniffed to, not the one the client declared.
    content_type VARCHAR(100) NOT NULL,
    kind VARCHAR(20) NOT NULL,          -- image | video | document
    size_bytes INTEGER NOT NULL,

    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT proposal_report_attachments_kind_check
        CHECK (kind IN ('image', 'video', 'document')),
    CONSTRAINT proposal_report_attachments_size_check
        CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_proposal_report_attachments_report
    ON proposal_report_attachments (report_id);

-- ── 4. Pointers on the dossier ────────────────────────────────────────
-- current_report_id mirrors current_version_id: the admin console and the
-- portal both need "the report that counts" without a MAX() subquery on every
-- row of a listing.
--
-- admin_seen_report_id mirrors admin_seen_version_id (migration 35). A report
-- arriving has to light the badge up, and a report is not a version, so the
-- unread test is now "unseen version OR unseen report".
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'project_proposals' AND column_name = 'current_report_id'
    ) THEN
        ALTER TABLE project_proposals ADD COLUMN current_report_id INTEGER NULL;
        ALTER TABLE project_proposals
            ADD CONSTRAINT fk_project_proposals_current_report_id
            FOREIGN KEY (current_report_id)
            REFERENCES proposal_reports (id) ON DELETE SET NULL;
        RAISE NOTICE 'added project_proposals.current_report_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'project_proposals' AND column_name = 'admin_seen_report_id'
    ) THEN
        ALTER TABLE project_proposals ADD COLUMN admin_seen_report_id INTEGER NULL;
        ALTER TABLE project_proposals
            ADD CONSTRAINT fk_project_proposals_admin_seen_report_id
            FOREIGN KEY (admin_seen_report_id)
            REFERENCES proposal_reports (id) ON DELETE SET NULL;
        RAISE NOTICE 'added project_proposals.admin_seen_report_id';
    END IF;
END $$;

-- The badge query asks only for the unread ones, which in steady state is a
-- handful of rows. Mirrors idx_project_proposals_unread from migration 35.
CREATE INDEX IF NOT EXISTS idx_project_proposals_unread_report
    ON project_proposals (updated_at DESC)
 WHERE admin_seen_report_id IS DISTINCT FROM current_report_id;

-- ── 5. Constraints create_all() would have left off ───────────────────
-- Same reasoning as migration 35: if the image started before this ran,
-- create_all() built the two tables from the models, and CREATE TABLE IF NOT
-- EXISTS above then skipped everything including the CHECKs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_reports'::regclass
           AND conname = 'proposal_reports_decision_check'
    ) THEN
        ALTER TABLE proposal_reports
            ADD CONSTRAINT proposal_reports_decision_check
            CHECK (decision IS NULL OR decision IN ('approved', 'changes_requested'))
            NOT VALID;
        ALTER TABLE proposal_reports VALIDATE CONSTRAINT proposal_reports_decision_check;
        RAISE NOTICE 'added proposal_reports_decision_check';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_reports'::regclass
           AND conname = 'uq_proposal_report_no'
    ) THEN
        ALTER TABLE proposal_reports
            ADD CONSTRAINT uq_proposal_report_no UNIQUE (proposal_id, report_no);
        RAISE NOTICE 'added uq_proposal_report_no';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_report_attachments'::regclass
           AND conname = 'proposal_report_attachments_kind_check'
    ) THEN
        ALTER TABLE proposal_report_attachments
            ADD CONSTRAINT proposal_report_attachments_kind_check
            CHECK (kind IN ('image', 'video', 'document')) NOT VALID;
        ALTER TABLE proposal_report_attachments
            VALIDATE CONSTRAINT proposal_report_attachments_kind_check;
        RAISE NOTICE 'added proposal_report_attachments_kind_check';
    END IF;
END $$;

SELECT 'Migration 36 completed successfully!' as message;
