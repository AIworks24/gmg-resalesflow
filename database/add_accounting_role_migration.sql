-- Migration: Add 'accounting' role to profiles table role constraint
-- This allows users to be assigned the accounting role for settlement agent form processing

-- First, let's check if the constraint exists and what values it currently allows
-- We'll need to drop the existing constraint and recreate it with the new role

-- Drop the existing check constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the new check constraint that includes 'accounting' role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'staff', 'accounting', 'requester', NULL));

-- Add a comment to document the change
COMMENT ON COLUMN profiles.role IS 'User role: admin (full access), staff (limited admin access), accounting (settlement agent forms only), requester (regular user), or NULL (unassigned)';