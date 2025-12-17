-- Rollback Migration: Remove 'accounting' role from profiles table role constraint
-- This reverts the accounting role addition and restores the original constraint

-- Drop the current check constraint that includes 'accounting' role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Restore the original check constraint (without 'accounting' role)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'staff', 'requester', NULL));

-- Add a comment to document the rollback
COMMENT ON COLUMN profiles.role IS 'User role: admin (full access), staff (limited admin access), requester (regular user), or NULL (unassigned)';

-- Optional: Update any existing accounting users to staff role before rollback
-- Uncomment the following lines if you want to convert accounting users to staff:
-- UPDATE profiles 
-- SET role = 'staff' 
-- WHERE role = 'accounting';