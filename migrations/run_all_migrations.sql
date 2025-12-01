-- MyZakat Database Setup Script
-- This script runs all migrations in the correct order for a fresh database installation
-- Run this script on a new database to set up the complete schema

\set ON_ERROR_STOP on

-- Start transaction
BEGIN;

SELECT '========================================' as message;
SELECT 'MyZakat Database Migration Script' as message;
SELECT 'Starting complete database setup...' as message;
SELECT '========================================' as message;

-- Migration 00: Initialize database structure
\echo ''
\echo 'Running Migration 00: Initialize database structure...'
\i migrations/00_init.sql

-- Migration 01: Add users table
\echo ''
\echo 'Running Migration 01: Add users table...'
\i migrations/01_add_users_table.sql

-- Migration 02: Add email verification
\echo ''
\echo 'Running Migration 02: Add email verification...'
\i migrations/02_add_email_verification.sql

-- Migration 03: Add certificate filename
\echo ''
\echo 'Running Migration 03: Add certificate filename...'
\i migrations/03_add_certificate_filename.sql

-- Migration 04: Consolidate authentication
\echo ''
\echo 'Running Migration 04: Consolidate authentication...'
\i migrations/04_consolidate_auth.sql

-- Migration 05: Add slideshow
\echo ''
\echo 'Running Migration 05: Add slideshow...'
\i migrations/05_add_slideshow.sql

-- Migration 06: Add slideshow image URL
\echo ''
\echo 'Running Migration 06: Add slideshow image URL...'
\i migrations/06_add_slideshow_image_url.sql

-- Migration 07: Add urgent needs
\echo ''
\echo 'Running Migration 07: Add urgent needs...'
\i migrations/07_add_urgent_needs.sql

-- Commit transaction
COMMIT;

SELECT '========================================' as message;
SELECT 'All migrations completed successfully!' as message;
SELECT 'Database is ready to use.' as message;
SELECT '========================================' as message;

-- Display summary
SELECT 'Database Summary:' as message;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

