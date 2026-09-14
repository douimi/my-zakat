-- Migration 31: Media library — per-user workspaces on top of S3
--
-- One row per photo or video. S3 holds only bytes; this table is the index
-- that browse, search and sort run against.
--
-- Privacy is the `status` column, not the object location: an object lands once
-- at `object_key` and never moves, so a URL stored in a story can never break.
--
-- `search_text` is denormalized on write (lowercased filename + title +
-- description + pipe-wrapped tags) so search is a single ILIKE that behaves the
-- same on PostgreSQL and on the SQLite used by the test suite.

CREATE TABLE IF NOT EXISTS media_assets (
    id                  SERIAL PRIMARY KEY,
    -- NULL owner = the "Unassigned" workspace: legacy media, or media whose
    -- owner's account was deleted.
    owner_id            INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    object_key          VARCHAR(500)   NOT NULL UNIQUE,
    filename            VARCHAR(255)   NOT NULL,   -- original name, as uploaded
    media_type          VARCHAR(10)    NOT NULL,   -- image | video
    content_type        VARCHAR(100)   NOT NULL,
    size_bytes          BIGINT         NOT NULL DEFAULT 0,
    width               INTEGER,
    height              INTEGER,
    duration_seconds    DOUBLE PRECISION,
    thumbnail_key       VARCHAR(500),
    checksum_sha256     VARCHAR(64),               -- duplicate detection per workspace
    -- Metadata the owner supplies
    title               VARCHAR(200),
    description         TEXT,
    tags                JSONB          NOT NULL DEFAULT '[]'::jsonb,
    -- `ILIKE` against this column is a sequential scan by design. A pg_trgm
    -- GIN index can be added later as a pure-addition migration once the
    -- table passes roughly 100k rows. It is deliberately not here now,
    -- partly because `CREATE EXTENSION pg_trgm` needs privileges some
    -- managed PostgreSQL hosts withhold, and a migration that fails on the
    -- production host is worse than a seq scan.
    search_text         TEXT           NOT NULL DEFAULT '',
    -- Lifecycle
    status              VARCHAR(20)    NOT NULL DEFAULT 'private', -- private | submitted | public
    reviewed_by_id      INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMP,
    review_note         TEXT,
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Covers owner-scoped lookups (WHERE owner_id = ? / IS NULL) and the default
-- workspace listing sort (owner scope + ORDER BY created_at DESC, id DESC
-- with offset/limit) in one index; a standalone index on owner_id alone
-- would be pure write cost once this exists.
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created
    ON media_assets(owner_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);
-- Not UNIQUE: duplicate detection here is advisory. A unique constraint would
-- block a legitimate re-upload after a delete, and PostgreSQL treats NULLs as
-- distinct, so the "Unassigned" workspace (owner_id IS NULL) would slip
-- through such a constraint anyway.
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_checksum ON media_assets(owner_id, checksum_sha256);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_status ON media_assets(owner_id, status);

-- The review queue is small and read often.
CREATE INDEX IF NOT EXISTS idx_media_assets_submitted
    ON media_assets(created_at DESC) WHERE status = 'submitted';

SELECT 'Migration 31 completed successfully!' as message;
