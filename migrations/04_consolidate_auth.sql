-- Migration 04: Consolidate authentication to use only users table
-- This migration:
-- 1. Creates a super admin user from existing admin (if exists)
-- 2. Drops the admins table

-- First, create a super admin user if one doesn't exist
-- Using a default admin@example.com with the password 'admin123'
-- You should change this password immediately after deployment!

DO $$
DECLARE
    admin_exists INTEGER;
    admin_username VARCHAR(100);
    admin_password VARCHAR(200);
BEGIN
    -- Check if there's already an admin user
    SELECT COUNT(*) INTO admin_exists FROM users WHERE is_admin = true;
    
    IF admin_exists = 0 THEN
        -- Get the first admin from the admins table (if exists)
        BEGIN
            SELECT username, password INTO admin_username, admin_password 
            FROM admins 
            LIMIT 1;
            
            -- Create a user from the admin account
            IF admin_username IS NOT NULL THEN
                INSERT INTO users (email, password, name, is_active, is_admin, created_at, updated_at)
                VALUES (
                    admin_username || '@admin.local',  -- Convert username to email format
                    admin_password,  -- Use existing hashed password
                    admin_username,
                    true,
                    true,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (email) DO UPDATE 
                SET is_admin = true;
                
                RAISE NOTICE 'Migrated admin user: % to email: %@admin.local', admin_username, admin_username;
            END IF;
        EXCEPTION
            WHEN undefined_table THEN
                RAISE NOTICE 'Admins table does not exist, skipping migration';
        END;
        
        -- If still no admin exists, create a default one
        SELECT COUNT(*) INTO admin_exists FROM users WHERE is_admin = true;
        IF admin_exists = 0 THEN
            -- Create default super admin (password: admin123)
            -- Hash generated for 'admin123' using bcrypt
            INSERT INTO users (email, password, name, is_active, is_admin, created_at, updated_at)
            VALUES (
                'admin@example.com',
                '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU8rR5FsLLqe',  -- bcrypt hash for 'admin123'
                'Super Admin',
                true,
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (email) DO UPDATE 
            SET is_admin = true;
            
            RAISE NOTICE 'Created default admin user: admin@example.com (password: admin123)';
            RAISE NOTICE 'IMPORTANT: Please change this password immediately!';
        END IF;
    ELSE
        RAISE NOTICE 'Admin user already exists, skipping creation';
    END IF;
END $$;

-- Now drop the admins table if it exists
DROP TABLE IF EXISTS admins CASCADE;

SELECT 'Migration 04 completed successfully!' as message;

