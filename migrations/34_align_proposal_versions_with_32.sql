-- Migration 34: bring proposal_versions into line with what migration 32
-- described, on databases where the table was created by something else first.
--
-- Why this is needed at all
-- -------------------------
-- backend/main.py calls Base.metadata.create_all() at import time. On a
-- deployment where the new image started BEFORE migration 32 was applied,
-- create_all built `proposal_versions` and `proposal_access_codes` from the
-- SQLAlchemy models -- and create_all only ever creates missing TABLES, so it
-- left the pre-existing `project_proposals` alone (hence the 500s: the code
-- selected current_version_id from a table that never got the column).
--
-- Migration 32 then ran, its CREATE TABLE IF NOT EXISTS statements skipped the
-- two tables that already existed, and only its ALTER/INSERT/CREATE INDEX
-- statements took effect. The result is a table with the right columns and
-- indexes but the model's types and none of the migration's constraints:
--
--   * the three money columns are DOUBLE PRECISION (Column(Float)) where
--     migration 32 -- and migration 29 before it, for the same fields on
--     project_proposals -- specified NUMERIC(10, 2);
--   * the CHECK constraints on `decision` and `version_no` are absent.
--
-- This migration closes both gaps. It is a no-op on any database where
-- migration 32 created the table itself.
--
-- Idempotent: safe to run more than once, and safe to run on a database that
-- was never in the divergent state.

-- ── Money as exact decimals, not binary floats ────────────────────────
-- Dollar amounts compared or summed as DOUBLE PRECISION accumulate the usual
-- representation error; NUMERIC(10, 2) is what the rest of this schema uses
-- for the same values. The USING cast is exact for the magnitudes involved
-- (a proposal budget), and ALTER TYPE to the same type is a no-op, so the
-- whole block is safe to re-run.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'proposal_versions'
           AND column_name = 'cost_per_unit_usd'
           AND data_type <> 'numeric'
    ) THEN
        ALTER TABLE proposal_versions
            ALTER COLUMN cost_per_unit_usd TYPE NUMERIC(10, 2)
                USING ROUND(cost_per_unit_usd::numeric, 2),
            ALTER COLUMN additional_expenses_usd TYPE NUMERIC(10, 2)
                USING ROUND(additional_expenses_usd::numeric, 2),
            ALTER COLUMN total_amount_usd TYPE NUMERIC(10, 2)
                USING ROUND(total_amount_usd::numeric, 2);
        RAISE NOTICE 'proposal_versions money columns converted to NUMERIC(10,2)';
    ELSE
        RAISE NOTICE 'proposal_versions money columns already NUMERIC -- nothing to do';
    END IF;
END $$;

-- The model declares DEFAULT 0 for additional_expenses_usd; migration 32 put
-- it in the DDL. create_all leaves server-side defaults off, so restore it.
ALTER TABLE proposal_versions ALTER COLUMN additional_expenses_usd SET DEFAULT 0;

-- ── The constraints migration 32 specified ────────────────────────────
-- NOT VALID first, then VALIDATE: the ADD takes only a brief lock and the
-- validation pass does not block writes. With a handful of rows this is
-- indistinguishable from doing it in one step, but it stays correct when the
-- table is large.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_versions'::regclass
           AND conname = 'proposal_versions_decision_check'
    ) THEN
        ALTER TABLE proposal_versions
            ADD CONSTRAINT proposal_versions_decision_check
            CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'changes_requested'))
            NOT VALID;
        ALTER TABLE proposal_versions VALIDATE CONSTRAINT proposal_versions_decision_check;
        RAISE NOTICE 'added proposal_versions_decision_check';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposal_versions'::regclass
           AND conname = 'proposal_versions_version_no_check'
    ) THEN
        ALTER TABLE proposal_versions
            ADD CONSTRAINT proposal_versions_version_no_check
            CHECK (version_no > 0)
            NOT VALID;
        ALTER TABLE proposal_versions VALIDATE CONSTRAINT proposal_versions_version_no_check;
        RAISE NOTICE 'added proposal_versions_version_no_check';
    END IF;
END $$;

-- ── Drop the indexes create_all added on top of the real ones ─────────
-- Each duplicates something already indexed, and every one of them is
-- maintained on each write for no read benefit:
--   ix_proposal_versions_proposal_id  -> leading column of uq_proposal_version_no
--   ix_proposal_access_codes_email    -> superseded by idx_proposal_access_codes_email,
--                                        which indexes lower(email), the form actually queried
--   ix_proposal_access_codes_created_at -> only ever used together with the email
--                                          or ip predicate, both already covered
-- The primary-key indexes (ix_*_id) are left alone: dropping a PK's index is
-- not what these are, but they are harmless duplicates of the pkey and
-- removing them is not worth the risk of a name collision on some other DB.
DROP INDEX IF EXISTS ix_proposal_versions_proposal_id;
DROP INDEX IF EXISTS ix_proposal_access_codes_email;
DROP INDEX IF EXISTS ix_proposal_access_codes_created_at;

SELECT 'Migration 34 completed successfully!' as message;
