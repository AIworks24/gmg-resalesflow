-- Immediate fix for duplicate profile issue
-- Run this in your main database to diagnose and fix the problem

-- ============================================
-- STEP 1: Check if profile already exists for the failing user
-- ============================================
-- Replace '5717f818-d5ad-4654-b423-a722005d3643' with the actual user ID from the error
SELECT 
    'Profile Check' AS check_type,
    id,
    email,
    role,
    active,
    created_at,
    updated_at
FROM profiles
WHERE id = '5717f818-d5ad-4654-b423-a722005d3643';

-- ============================================
-- STEP 2: Check if auth user exists
-- ============================================
SELECT 
    'Auth User Check' AS check_type,
    id,
    email,
    created_at
FROM auth.users
WHERE id = '5717f818-d5ad-4654-b423-a722005d3643';

-- ============================================
-- STEP 3: If profile exists but shouldn't, you can either:
-- ============================================

-- OPTION A: Delete the orphaned profile (if auth user doesn't exist)
-- DELETE FROM profiles WHERE id = '5717f818-d5ad-4654-b423-a722005d3643';

-- OPTION B: Update the existing profile instead of inserting
-- UPDATE profiles 
-- SET 
--     email = 'alyssadapula20@gmail.com',
--     role = 'requester',
--     active = true,
--     updated_at = NOW()
-- WHERE id = '5717f818-d5ad-4654-b423-a722005d3643';

-- ============================================
-- STEP 4: Find all orphaned profiles (profiles without auth users)
-- ============================================
SELECT 
    'Orphaned Profiles' AS check_type,
    COUNT(*) AS count
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id
);

-- Show orphaned profiles
SELECT 
    id,
    email,
    role,
    created_at
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id
)
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- STEP 5: Clean up all orphaned profiles (CAREFUL - review first!)
-- ============================================
-- Uncomment to delete orphaned profiles:
-- DELETE FROM profiles
-- WHERE id NOT IN (SELECT id FROM auth.users);

-- ============================================
-- STEP 6: Check for triggers that might be creating profiles
-- ============================================
SELECT 
    trigger_name,
    event_object_schema,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
    AND event_object_table = 'users';






