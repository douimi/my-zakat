-- Migration 21: Manager role + story approval workflow
--
-- Adds a `role` column to users with values 'admin' | 'manager' | 'user'.
-- Existing admins (is_admin=TRUE) are backfilled to role='admin'.
-- Adds approval-workflow columns to stories: stories created by managers stay
-- hidden (is_pending_approval=TRUE) until an admin approves them.

-- Users: role
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND role <> 'admin';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Stories: pending approval + ownership
ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS is_pending_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stories_pending_approval
    ON stories(is_pending_approval) WHERE is_pending_approval = TRUE;

CREATE INDEX IF NOT EXISTS idx_stories_created_by
    ON stories(created_by_user_id);

SELECT 'Migration 21 completed successfully!' as message;
