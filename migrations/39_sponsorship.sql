-- Migration 39: sponsoring a family or an orphan.
--
-- Design: docs/superpowers/specs/2026-11-09-sponsorship-and-arabic-design.md
--
-- Class-table inheritance: one `sponsorship_cases` row per dossier (kind =
-- family | orphan) carries the workflow, the public profile and the money;
-- the kind-specific facts live in a 1:1 details table. Every other table
-- (documents, history, sponsorships, disbursements, updates) hangs off the
-- case, so the two journeys share one machine instead of two that drift.
--
-- Additive and idempotent. No BEGIN/COMMIT: scripts/migrate.sh wraps the file
-- in its own transaction together with the tracking row.

-- ── The dossier ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsorship_cases (
    id                          SERIAL PRIMARY KEY,
    -- Random, not sequential: the public listing must leak neither how many
    -- cases exist nor in what order they arrived. F-XXXXXX / O-XXXXXX.
    reference                   VARCHAR(12)     NOT NULL UNIQUE,
    kind                        VARCHAR(10)     NOT NULL,
    status                      VARCHAR(20)     NOT NULL DEFAULT 'submitted',

    -- Who filed it. The email is the identity for the applicant portal.
    submitter_type              VARCHAR(20)     NOT NULL,          -- self | organization | staff
    submitter_email             VARCHAR(200)    NOT NULL,
    submitter_name              VARCHAR(200)    NOT NULL,
    submitter_phone             VARCHAR(50),
    organization_name           VARCHAR(200),
    organization_registration   VARCHAR(100),
    organization_contact_role   VARCHAR(100),
    preferred_language          VARCHAR(5)      NOT NULL DEFAULT 'en',

    -- Where. country/region/city may be shown; address never is.
    country                     VARCHAR(100)    NOT NULL,
    region                      VARCHAR(150),
    city                        VARCHAR(150)    NOT NULL,
    address                     TEXT,

    -- The situation, as told by the applicant (private).
    situation_category          VARCHAR(40),
    situation_description       TEXT            NOT NULL,
    monthly_income_cents        INTEGER         NOT NULL DEFAULT 0,
    income_sources              TEXT,
    other_aid                   TEXT,
    urgent_needs                TEXT,

    -- [{category, monthly_cents, note}] — the requested breakdown.
    needs                       JSONB           NOT NULL DEFAULT '[]'::jsonb,
    requested_monthly_cents     INTEGER         NOT NULL DEFAULT 0,
    -- Set by staff on approval; the amount sponsors are asked to cover.
    approved_monthly_cents      INTEGER,

    -- The curated public profile. Never derived from the private fields.
    public_name                 VARCHAR(100),
    public_title                VARCHAR(200),
    public_title_ar             VARCHAR(200),
    public_story                TEXT,
    public_story_ar             TEXT,
    public_photo_key            VARCHAR(500),

    -- Consent, with the exact wording agreed to.
    consent_verification        BOOLEAN         NOT NULL DEFAULT FALSE,
    consent_publication         BOOLEAN         NOT NULL DEFAULT FALSE,
    consent_text                TEXT,
    consent_at                  TIMESTAMP,

    -- [{case_id, reference, reason}] raised at submission; cleared by staff.
    duplicate_flags             JSONB           NOT NULL DEFAULT '[]'::jsonb,
    duplicates_reviewed_at      TIMESTAMP,

    assigned_to                 INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    close_reason                VARCHAR(40),

    submitted_at                TIMESTAMP       NOT NULL DEFAULT NOW(),
    submitted_ip                VARCHAR(45),
    updated_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    approved_at                 TIMESTAMP,
    published_at                TIMESTAMP,
    closed_at                   TIMESTAMP,
    -- Unread for staff = applicant acted after the last time staff opened it.
    last_applicant_activity_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    admin_seen_at               TIMESTAMP,
    -- What the applicant has already seen of their own timeline.
    applicant_seen_at           TIMESTAMP,

    CONSTRAINT sponsorship_cases_kind_check CHECK (kind IN ('family', 'orphan')),
    CONSTRAINT sponsorship_cases_status_check CHECK (status IN (
        'submitted', 'under_review', 'info_requested', 'approved',
        'published', 'paused', 'rejected', 'closed')),
    CONSTRAINT sponsorship_cases_submitter_check
        CHECK (submitter_type IN ('self', 'organization', 'staff')),
    CONSTRAINT sponsorship_cases_amounts_check CHECK (
        monthly_income_cents >= 0 AND requested_monthly_cents >= 0
        AND (approved_monthly_cents IS NULL OR approved_monthly_cents > 0))
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_cases_kind_status
    ON sponsorship_cases (kind, status);
CREATE INDEX IF NOT EXISTS idx_sponsorship_cases_submitter_email
    ON sponsorship_cases (lower(submitter_email));
-- The public listing: published cases, longest-waiting first.
CREATE INDEX IF NOT EXISTS idx_sponsorship_cases_published
    ON sponsorship_cases (kind, published_at) WHERE status = 'published';

-- ── Family details (1:1 when kind = family) ───────────────────────────
CREATE TABLE IF NOT EXISTS sponsorship_family_details (
    case_id                     INTEGER PRIMARY KEY
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    head_full_name              VARCHAR(200)    NOT NULL,
    head_national_id            VARCHAR(50),
    head_birth_year             INTEGER,
    head_gender                 VARCHAR(10),
    head_marital_status         VARCHAR(20),
    head_occupation             VARCHAR(150),
    household_size              INTEGER         NOT NULL,
    housing_status              VARCHAR(30),
    monthly_rent_cents          INTEGER         NOT NULL DEFAULT 0,
    health_notes                TEXT,
    CONSTRAINT sponsorship_family_size_check CHECK (household_size > 0)
);

CREATE TABLE IF NOT EXISTS sponsorship_household_members (
    id                          SERIAL PRIMARY KEY,
    case_id                     INTEGER         NOT NULL
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    position                    INTEGER         NOT NULL DEFAULT 0,
    first_name                  VARCHAR(100)    NOT NULL,
    relationship                VARCHAR(30)     NOT NULL,
    gender                      VARCHAR(10),
    birth_year                  INTEGER,
    occupation_or_school        VARCHAR(200),
    health_note                 TEXT,
    is_orphan                   BOOLEAN         NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_household_members_case
    ON sponsorship_household_members (case_id);

-- ── Orphan details (1:1 when kind = orphan) ───────────────────────────
CREATE TABLE IF NOT EXISTS sponsorship_orphan_details (
    case_id                     INTEGER PRIMARY KEY
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    full_name                   VARCHAR(200)    NOT NULL,
    gender                      VARCHAR(10)     NOT NULL,
    birth_date                  DATE            NOT NULL,
    orphan_type                 VARCHAR(10)     NOT NULL,           -- father | mother | both
    father_name                 VARCHAR(200),
    father_death_date           DATE,
    father_death_cause          TEXT,
    mother_name                 VARCHAR(200),
    mother_alive                BOOLEAN,
    mother_death_date           DATE,
    guardian_name               VARCHAR(200)    NOT NULL,
    guardian_relationship       VARCHAR(50)     NOT NULL,
    guardian_national_id        VARCHAR(50),
    guardian_phone              VARCHAR(50),
    lives_with                  VARCHAR(30),
    school_level                VARCHAR(100),
    school_name                 VARCHAR(200),
    health_status               TEXT,
    interests                   TEXT,
    siblings_count              INTEGER         NOT NULL DEFAULT 0,
    -- The family this child belongs to, when it is on the platform too. The
    -- family is referenced, never copied: no duplicate, no shared sponsorship.
    family_case_id              INTEGER
                                REFERENCES sponsorship_cases(id) ON DELETE SET NULL,
    CONSTRAINT sponsorship_orphan_type_check
        CHECK (orphan_type IN ('father', 'mother', 'both'))
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_orphan_family
    ON sponsorship_orphan_details (family_case_id);

-- ── Supporting documents ──────────────────────────────────────────────
-- Bytes in S3 under object_key (generated server-side); only metadata here.
-- Never served through a public URL.
CREATE TABLE IF NOT EXISTS sponsorship_case_documents (
    id                          SERIAL PRIMARY KEY,
    case_id                     INTEGER         NOT NULL
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    doc_type                    VARCHAR(40)     NOT NULL,
    filename                    VARCHAR(255)    NOT NULL,
    object_key                  VARCHAR(500)    NOT NULL,
    content_type                VARCHAR(100)    NOT NULL,
    kind                        VARCHAR(20)     NOT NULL,           -- image | document
    size_bytes                  INTEGER         NOT NULL,
    uploaded_by                 VARCHAR(20)     NOT NULL,           -- applicant | staff
    uploaded_by_email           VARCHAR(255),
    uploaded_at                 TIMESTAMP       NOT NULL DEFAULT NOW(),
    review_status               VARCHAR(20)     NOT NULL DEFAULT 'pending',
    review_note                 TEXT,
    reviewed_at                 TIMESTAMP,
    reviewed_by                 INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT sponsorship_documents_review_check
        CHECK (review_status IN ('pending', 'verified', 'rejected')),
    CONSTRAINT sponsorship_documents_size_check CHECK (size_bytes > 0)
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_case_documents_case
    ON sponsorship_case_documents (case_id);

-- ── The history: append-only, written in the same transaction as the change ──
CREATE TABLE IF NOT EXISTS sponsorship_case_events (
    id                          SERIAL PRIMARY KEY,
    case_id                     INTEGER         NOT NULL
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    type                        VARCHAR(40)     NOT NULL,
    actor_type                  VARCHAR(20)     NOT NULL,           -- staff | applicant | sponsor | system
    actor_user_id               INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    -- A snapshot, not a join: the record must outlive the account.
    actor_label                 VARCHAR(255),
    from_status                 VARCHAR(20),
    to_status                   VARCHAR(20),
    visibility                  VARCHAR(12)     NOT NULL DEFAULT 'internal',
    message                     TEXT,                                -- shown per visibility
    note                        TEXT,                                -- staff only, always
    changes                     JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT sponsorship_events_visibility_check
        CHECK (visibility IN ('internal', 'applicant', 'sponsor'))
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_case_events_case
    ON sponsorship_case_events (case_id, created_at DESC);

-- ── A sponsor's monthly commitment ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsorships (
    id                          SERIAL PRIMARY KEY,
    -- No cascade: money records outlive nothing. Cases are closed, not deleted.
    case_id                     INTEGER         NOT NULL REFERENCES sponsorship_cases(id),
    sponsor_email               VARCHAR(200)    NOT NULL,
    sponsor_name                VARCHAR(200)    NOT NULL,
    preferred_language          VARCHAR(5)      NOT NULL DEFAULT 'en',
    monthly_amount_cents        INTEGER         NOT NULL,
    currency                    VARCHAR(3)      NOT NULL DEFAULT 'usd',
    status                      VARCHAR(20)     NOT NULL DEFAULT 'pending',
    stripe_checkout_session_id  VARCHAR(255)    UNIQUE,
    stripe_subscription_id      VARCHAR(255)    UNIQUE,
    stripe_customer_id          VARCHAR(255),
    checkout_expires_at         TIMESTAMP,
    started_at                  TIMESTAMP,
    last_payment_at             TIMESTAMP,
    ended_at                    TIMESTAMP,
    end_reason                  VARCHAR(40),
    end_note                    TEXT,
    ended_by                    VARCHAR(20),                         -- sponsor | staff | system | stripe
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT sponsorships_amount_check CHECK (monthly_amount_cents > 0),
    CONSTRAINT sponsorships_status_check CHECK (status IN (
        'pending', 'active', 'past_due', 'canceled', 'ended', 'abandoned'))
);
CREATE INDEX IF NOT EXISTS idx_sponsorships_case ON sponsorships (case_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsorships_email ON sponsorships (lower(sponsor_email));

-- Every charge is an ordinary donation (receipt, totals, admin list), tagged.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS sponsorship_id INTEGER NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_donations_sponsorship_id'
    ) THEN
        ALTER TABLE donations
            ADD CONSTRAINT fk_donations_sponsorship_id
            FOREIGN KEY (sponsorship_id) REFERENCES sponsorships (id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_donations_sponsorship ON donations (sponsorship_id)
    WHERE sponsorship_id IS NOT NULL;

-- ── Use of funds ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsorship_disbursements (
    id                          SERIAL PRIMARY KEY,
    case_id                     INTEGER         NOT NULL REFERENCES sponsorship_cases(id),
    amount_cents                INTEGER         NOT NULL,
    category                    VARCHAR(30)     NOT NULL,
    period                      VARCHAR(7),                          -- YYYY-MM it covers
    description                 TEXT            NOT NULL,            -- shown to sponsors and applicant
    description_ar              TEXT,
    internal_note               TEXT,
    disbursed_at                DATE            NOT NULL,
    receipt_document_id         INTEGER
                                REFERENCES sponsorship_case_documents(id) ON DELETE SET NULL,
    recorded_by                 INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT sponsorship_disbursements_amount_check CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_disbursements_case
    ON sponsorship_disbursements (case_id, disbursed_at DESC);

-- ── News for the case's sponsors ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsorship_case_updates (
    id                          SERIAL PRIMARY KEY,
    case_id                     INTEGER         NOT NULL
                                REFERENCES sponsorship_cases(id) ON DELETE CASCADE,
    title                       VARCHAR(200)    NOT NULL,
    title_ar                    VARCHAR(200),
    body                        TEXT            NOT NULL,
    body_ar                     TEXT,
    photo_key                   VARCHAR(500),
    created_by                  INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_case_updates_case
    ON sponsorship_case_updates (case_id, created_at DESC);

SELECT 'Migration 39 completed successfully!' as message;
