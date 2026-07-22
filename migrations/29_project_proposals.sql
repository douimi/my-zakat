-- Migration 29: Project proposals — digital submission of the paper funding
-- request form. Mirrors every field from the physical PDF applicants used to
-- fax / email:
--   * Personal information (name, ID, DOB, contact, education).
--   * Project information (name, description, problem, beneficiaries, impact).
--   * Project plan (steps, location, materials, duration, continuity,
--     feasibility, challenges).
--   * Required budget (unit cost × count + additional expenses = total).
--
-- Submissions land in status='submitted' and are reviewed by admins/managers.

CREATE TABLE IF NOT EXISTS project_proposals (
    id                          SERIAL PRIMARY KEY,

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
    target_beneficiaries        TEXT            NOT NULL,   -- description + count
    community_impact            TEXT            NOT NULL,   -- how it serves the community
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
    unit_type                   VARCHAR(50)     NOT NULL,   -- e.g. 'family', 'parcel'
    additional_expenses_usd     NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    additional_expenses_description TEXT,
    total_amount_usd            NUMERIC(10, 2)  NOT NULL,

    -- ── Metadata / review workflow ─────────────────────────
    status                      VARCHAR(20)     NOT NULL DEFAULT 'submitted',  -- submitted | under_review | approved | rejected
    admin_notes                 TEXT,
    reviewed_at                 TIMESTAMP,
    reviewed_by                 INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    submitted_ip                VARCHAR(45),
    submitted_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_proposals_status ON project_proposals(status);
CREATE INDEX IF NOT EXISTS idx_project_proposals_submitted_at ON project_proposals(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_proposals_email ON project_proposals(lower(email));

SELECT 'Migration 29 completed successfully!' as message;
