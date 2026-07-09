-- Migration 28: Fundraising projects with public transparency
--
-- Displays a "Goal / Spent / Remaining" card for each active project on
-- the homepage, with a Donate button that pre-fills the donation form.
-- Everything (goal, spent, image, order, active state) is admin-editable.

CREATE TABLE IF NOT EXISTS fundraising_projects (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(200)   NOT NULL,
    slug                VARCHAR(200)   NOT NULL UNIQUE,
    short_description   TEXT           NOT NULL,   -- one or two lines shown on the card
    description         TEXT,                       -- optional long-form detail
    image_url           VARCHAR(500),
    -- Money — kept in cents to avoid float rounding headaches.
    goal_cents          INTEGER        NOT NULL,
    spent_cents         INTEGER        NOT NULL DEFAULT 0,
    currency            VARCHAR(3)     NOT NULL DEFAULT 'USD',
    -- Donation UX
    suggested_donation_cents INTEGER,               -- pre-fills the Donate form's amount
    -- Optional urgency signals
    deadline            TIMESTAMP,
    -- Status + display
    status              VARCHAR(20)    NOT NULL DEFAULT 'active', -- active | completed | paused
    display_order       INTEGER        NOT NULL DEFAULT 0,
    is_active           BOOLEAN        NOT NULL DEFAULT TRUE,      -- gate on the homepage
    is_featured         BOOLEAN        NOT NULL DEFAULT FALSE,
    -- Optional category tag (free text so admin doesn't need to pre-create)
    category            VARCHAR(100),
    -- Audit
    created_by          INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_active_order
    ON fundraising_projects(is_active, display_order) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_projects_status ON fundraising_projects(status);

SELECT 'Migration 28 completed successfully!' as message;
