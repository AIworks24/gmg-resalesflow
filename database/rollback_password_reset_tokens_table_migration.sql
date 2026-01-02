-- Rollback migration for password_reset_tokens table
-- This script removes the password_reset_tokens table and all associated objects
-- Use this to revert the create_password_reset_tokens_table_migration.sql

-- Drop the RLS policy first (must be dropped before table)
DROP POLICY IF EXISTS "Service role can manage password reset tokens" ON password_reset_tokens;

-- Drop indexes (will be automatically dropped with table, but explicit for clarity)
DROP INDEX IF EXISTS idx_password_reset_tokens_expires_at;
DROP INDEX IF EXISTS idx_password_reset_tokens_token_hash;
DROP INDEX IF EXISTS idx_password_reset_tokens_user_id;

-- Drop the table (this will also drop all indexes and constraints)
DROP TABLE IF EXISTS password_reset_tokens;

-- Note: The COMMENT is automatically removed when the table is dropped

