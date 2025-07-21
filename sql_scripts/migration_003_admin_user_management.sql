-- Migration 003: Fix RLS policies for admin user management
-- Created: 2024-01-XX
-- Purpose: Allow admins to create and manage other users

BEGIN;

-- Drop existing profile policies that are too restrictive
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable delete for users on their own profile" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "Profile view policy" ON public.profiles;
DROP POLICY IF EXISTS "Profile insert policy" ON public.profiles;
DROP POLICY IF EXISTS "Profile update policy" ON public.profiles;
DROP POLICY IF EXISTS "Profile delete policy" ON public.profiles;

-- Create new comprehensive profile policies

-- SELECT: Users can view their own profile, service role can view all
CREATE POLICY "Profile view policy"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id OR
    auth.role() = 'service_role'
  );

-- INSERT: Users can create their own profile, service role can create any
CREATE POLICY "Profile insert policy"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id OR
    auth.role() = 'service_role'
  );

-- UPDATE: Users can update their own profile, service role can update any
CREATE POLICY "Profile update policy"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id OR
    auth.role() = 'service_role'
  );

-- DELETE: Users can delete their own profile, service role can delete any
CREATE POLICY "Profile delete policy"
  ON public.profiles
  FOR DELETE
  USING (
    auth.uid() = id OR
    auth.role() = 'service_role'
  );

COMMIT;

-- Add comments for documentation
COMMENT ON POLICY "Profile view policy" ON public.profiles IS 'Users can view their own profile, admins can view all profiles';
COMMENT ON POLICY "Profile insert policy" ON public.profiles IS 'Users can create their own profile, admins can create any profile';
COMMENT ON POLICY "Profile update policy" ON public.profiles IS 'Users can update their own profile, admins can update any profile';
COMMENT ON POLICY "Profile delete policy" ON public.profiles IS 'Users can delete their own profile, admins can delete any profile'; 