-- Migration 32: Project proposal versioning + submitter portal.
--
-- Additive and idempotent. Run order matters — see the plan's
-- "Deployment order" section:
--   1. this migration           (old code keeps working)
--   2. deploy the new backend
--   3. migration 33             (drops the legacy content columns)
--
-- What it does:
--   * creates proposal_versions  — one immutable row per submission
--   * creates proposal_access_codes — one-time portal login codes
--   * adds project_proposals.current_version_id
--   * backfills version 1 for every pre-existing proposal
--   * drops the NOT NULL constraints on the legacy content columns, so the
--     new code can insert a dossier row that carries no content

CREATE TABLE IF NOT EXISTS proposal_versions (
    id                          SERIAL PRIMARY KEY,
    proposal_id                 INTEGER         NOT NULL REFERENCES project_proposals(id) ON DELETE CASCADE,
    version_no                  INTEGER         NOT NULL CHECK (version_no > 0),

    -- ── Section 1: Personal information ────────────────────
    full_name                   VARCHAR(200)    NOT NULL,
    national_id                 VARCHAR(50)     NOT NULL,
    date_of_birth_year          INTEGER         NOT NULL,
    place_of_residence          VARCHAR(300)    NOT NULL,
    mobile_number               VARCHAR(50)     NOT NULL,
    email                       VARCHAR(200)    NOT NULL,
    educational_level           VARCHAR(200)    NOT NULL,

    -- ── Section 2: Project information ─────────────────────
    project_name                VARCHAR(300)    NOT NULL,
    project_description         TEXT            NOT NULL,
    problem_solved              TEXT            NOT NULL,
    target_beneficiaries        TEXT            NOT NULL,
    community_impact            TEXT            NOT NULL,
    expected_impact             TEXT            NOT NULL,

    -- ── Section 3: Project plan ────────────────────────────
    implementation_steps        TEXT            NOT NULL,
    implementation_location     TEXT            NOT NULL,
    required_materials          TEXT            NOT NULL,
    expected_duration           VARCHAR(300)    NOT NULL,
    continuity_plan             TEXT            NOT NULL,
    feasibility                 TEXT            NOT NULL,
    expected_challenges         TEXT            NOT NULL,

    -- ── Section 4: Required budget ─────────────────────────
    number_of_beneficiaries     INTEGER         NOT NULL,
    cost_per_unit_usd           NUMERIC(10, 2)  NOT NULL,
    unit_type                   VARCHAR(50)     NOT NULL,
    additional_expenses_usd     NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    additional_expenses_description TEXT,
    total_amount_usd            NUMERIC(10, 2)  NOT NULL,

    -- ── This submission's own metadata ─────────────────────
    submitted_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_ip                VARCHAR(45),
    sms_consent                 BOOLEAN         NOT NULL DEFAULT FALSE,
    sms_consent_at              TIMESTAMP,
    sms_consent_text            TEXT,

    -- ── The decision on this version ───────────────────────
    -- NULL = awaiting review | approved | rejected | changes_requested
    decision                    VARCHAR(20)
        CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'changes_requested')),
    decision_comment            TEXT,           -- shown to the submitter
    internal_note               TEXT,           -- staff only
    decided_at                  TIMESTAMP,
    decided_by                  INTEGER         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_proposal_version_no UNIQUE (proposal_id, version_no)
);

CREATE TABLE IF NOT EXISTS proposal_access_codes (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(200) NOT NULL,
    code_hash     VARCHAR(255) NOT NULL,   -- bcrypt; the code itself is never stored
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP    NOT NULL,
    consumed_at   TIMESTAMP,
    attempts      INTEGER      NOT NULL DEFAULT 0,
    request_ip    VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_proposal_access_codes_email
    ON proposal_access_codes(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_access_codes_ip
    ON proposal_access_codes(request_ip, created_at DESC);

ALTER TABLE project_proposals
    ADD COLUMN IF NOT EXISTS current_version_id INTEGER
    REFERENCES proposal_versions(id) ON DELETE SET NULL;

-- ── Backfill: every pre-existing proposal becomes its own version 1 ────
-- The INSERT and the UPDATE are one transaction on purpose. psql runs a
-- script in autocommit, so without this an INSERT that commits before a
-- failing UPDATE would leave a version row with a NULL pointer -- and the
-- re-run would then collide with uq_proposal_version_no and abort for good.
-- ON CONFLICT covers the same hole from the other side: if a version 1 does
-- somehow already exist, the UPDATE still repairs the pointer.
BEGIN;

INSERT INTO proposal_versions (
    proposal_id, version_no,
    full_name, national_id, date_of_birth_year, place_of_residence,
    mobile_number, email, educational_level,
    project_name, project_description, problem_solved, target_beneficiaries,
    community_impact, expected_impact,
    implementation_steps, implementation_location, required_materials,
    expected_duration, continuity_plan, feasibility, expected_challenges,
    number_of_beneficiaries, cost_per_unit_usd, unit_type,
    additional_expenses_usd, additional_expenses_description, total_amount_usd,
    submitted_at, submitted_ip,
    sms_consent, sms_consent_at, sms_consent_text,
    decision, decision_comment, internal_note, decided_at, decided_by
)
SELECT
    p.id, 1,
    p.full_name, p.national_id, p.date_of_birth_year, p.place_of_residence,
    p.mobile_number, p.email, p.educational_level,
    p.project_name, p.project_description, p.problem_solved, p.target_beneficiaries,
    p.community_impact, p.expected_impact,
    p.implementation_steps, p.implementation_location, p.required_materials,
    p.expected_duration, p.continuity_plan, p.feasibility, p.expected_challenges,
    p.number_of_beneficiaries, p.cost_per_unit_usd, p.unit_type,
    COALESCE(p.additional_expenses_usd, 0), p.additional_expenses_description, p.total_amount_usd,
    p.submitted_at, p.submitted_ip,
    COALESCE(p.sms_consent, FALSE), p.sms_consent_at, p.sms_consent_text,
    -- Only a closed status is a decision. 'submitted' and 'under_review' mean
    -- the version is still awaiting one.
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.status ELSE NULL END,
    -- Nothing was ever shown to submitters before this feature, so there is no
    -- decision_comment to recover; the old admin_notes were internal by design.
    NULL,
    p.admin_notes,
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.reviewed_at ELSE NULL END,
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.reviewed_by ELSE NULL END
FROM project_proposals p
WHERE p.current_version_id IS NULL
ON CONFLICT ON CONSTRAINT uq_proposal_version_no DO NOTHING;

UPDATE project_proposals p
   SET current_version_id = v.id
  FROM proposal_versions v
 WHERE v.proposal_id = p.id
   AND v.version_no = 1
   AND p.current_version_id IS NULL;

COMMIT;

-- ── Relax the legacy content columns ──────────────────────────────────
-- The new code writes content to proposal_versions and inserts dossier rows
-- without these. They are dropped by migration 33, after the deploy.
ALTER TABLE project_proposals ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN national_id DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN date_of_birth_year DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN place_of_residence DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN mobile_number DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN educational_level DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN project_name DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN project_description DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN problem_solved DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN target_beneficiaries DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN community_impact DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_impact DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN implementation_steps DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN implementation_location DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN required_materials DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_duration DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN continuity_plan DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN feasibility DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_challenges DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN number_of_beneficiaries DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN cost_per_unit_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN unit_type DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN additional_expenses_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN total_amount_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN sms_consent DROP NOT NULL;

SELECT 'Migration 32 completed successfully!' as message;
