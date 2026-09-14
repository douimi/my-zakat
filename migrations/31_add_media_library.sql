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
    search_text         TEXT           NOT NULL DEFAULT '',
    -- Lifecycle
    status              VARCHAR(20)    NOT NULL DEFAULT 'private', -- private | submitted | public
    reviewed_by_id      INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMP,
    review_note         TEXT,
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_checksum ON media_assets(checksum_sha256);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_status ON media_assets(owner_id, status);

-- The review queue is small and read often.
CREATE INDEX IF NOT EXISTS idx_media_assets_submitted
    ON media_assets(created_at DESC) WHERE status = 'submitted';

SELECT 'Migration 31 completed successfully!' as message;
