-- Migration: Add Email Verification Support
-- This migration adds all necessary database changes for email verification feature
-- This script is idempotent and can be run multiple times safely

-- ============================================
-- STEP 1: Add email_confirmed_at Column to Profiles
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'email_confirmed_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN email_confirmed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added email_confirmed_at column to profiles table';
    ELSE
        RAISE NOTICE 'email_confirmed_at column already exists';
    END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_email_confirmed_at 
ON profiles(email_confirmed_at);

-- Add comment to document the column
COMMENT ON COLUMN profiles.email_confirmed_at IS 'Timestamp when the user confirmed their email. NULL means email is not yet confirmed.';

-- ============================================
-- STEP 2: Update Role Constraint (Add 'requester', Remove 'user'/'external')
-- ============================================

-- First, migrate existing 'user' and 'external' roles to 'requester'
DO $$
BEGIN
    -- Update 'user' role to 'requester'
    IF EXISTS (SELECT 1 FROM profiles WHERE role = 'user') THEN
        UPDATE profiles SET role = 'requester' WHERE role = 'user';
        RAISE NOTICE 'Migrated users from user role to requester role';
    END IF;
    
    -- Update 'external' role to 'requester'
    IF EXISTS (SELECT 1 FROM profiles WHERE role = 'external') THEN
        UPDATE profiles SET role = 'requester' WHERE role = 'external';
        RAISE NOTICE 'Migrated users from external role to requester role';
    END IF;
END $$;

-- Drop the existing check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the new check constraint with 'requester' instead of 'user'/'external'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'staff', 'accounting', 'requester', NULL));

-- Update the comment to reflect the new role
COMMENT ON COLUMN profiles.role IS 'User role: admin (full access), staff (limited admin access), accounting (settlement agent forms only), requester (regular user who submits applications), or NULL (unassigned)';

-- ============================================
-- STEP 3: Auto-confirm Existing Users
-- ============================================
-- Set email_confirmed_at for all existing users who don't have it set
-- This ensures existing users aren't locked out

DO $$
BEGIN
    UPDATE profiles 
    SET email_confirmed_at = COALESCE(created_at, NOW())
    WHERE email_confirmed_at IS NULL;
    
    RAISE NOTICE 'Auto-confirmed % existing users', (SELECT COUNT(*) FROM profiles WHERE email_confirmed_at IS NOT NULL);
END $$;

-- ============================================
-- STEP 4: Enable Realtime for Profiles Table
-- ============================================
-- Enable Realtime replication for the profiles table so frontend can listen for email confirmation

-- Enable Realtime replication (only if not already enabled)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
        RAISE NOTICE 'Added profiles table to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'profiles table is already in supabase_realtime publication';
    END IF;
END $$;

-- ============================================
-- STEP 5: Add RLS Policies for Email Verification
-- ============================================
-- Allow users to view their own email confirmation status

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view their own profile verification status" ON profiles;

-- Create policy for viewing own verification status
CREATE POLICY "Users can view their own profile verification status"
ON profiles
FOR SELECT
USING (auth.uid() = id);

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can update their own email verification" ON profiles;

-- Create policy for updating own email verification (needed for Realtime)
CREATE POLICY "Users can update their own email verification"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these queries to verify the migration was successful:

-- Check if email_confirmed_at column exists
SELECT 
    'email_confirmed_at column' AS check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'profiles' AND column_name = 'email_confirmed_at'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END AS status;

-- Check role constraint
SELECT 
    'Role constraint' AS check_item,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
    AND conname = 'profiles_role_check';

-- Check role distribution
SELECT 
    'Current role distribution' AS info,
    role,
    COUNT(*) AS user_count
FROM profiles
GROUP BY role
ORDER BY role;

-- Check confirmed vs unconfirmed users
SELECT 
    'Email confirmation status' AS info,
    CASE 
        WHEN email_confirmed_at IS NOT NULL THEN 'Confirmed'
        ELSE 'Not Confirmed'
    END AS status,
    COUNT(*) AS user_count
FROM profiles
GROUP BY 
    CASE 
        WHEN email_confirmed_at IS NOT NULL THEN 'Confirmed'
        ELSE 'Not Confirmed'
    END;

-- Check Realtime replication
SELECT 
    'Realtime replication' AS check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = 'profiles'
        ) THEN '✅ ENABLED'
        ELSE '❌ DISABLED'
    END AS status;

-- Check RLS policies
SELECT 
    'RLS Policies' AS check_item,
    policyname,
    cmd AS command,
    qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname LIKE '%verification%';

-- ============================================
-- NOTES
-- ============================================
-- 1. This migration is idempotent - safe to run multiple times
-- 2. Existing users are automatically confirmed to prevent lockouts
-- 3. 'user' and 'external' roles are migrated to 'requester'
-- 4. Realtime is enabled for the profiles table
-- 5. RLS policies are created for email verification
-- 6. Run the verification queries above to confirm success

