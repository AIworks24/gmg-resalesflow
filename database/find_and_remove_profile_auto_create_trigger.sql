-- Find and remove the database trigger that auto-creates profiles
-- This is causing duplicate key errors in production

-- ============================================
-- STEP 1: Find triggers on auth.users that create profiles
-- ============================================
-- Check triggers on auth.users table (simplified to avoid array_agg issues)
SELECT 
    tgname AS trigger_name,
    tgenabled AS enabled,
    tgtype AS trigger_type
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
    AND NOT tgisinternal
ORDER BY tgname;

-- ============================================
-- STEP 2: Find functions that might create profiles
-- ============================================
-- Simplified query - just get function names
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public', 'auth')
    AND p.proname ILIKE '%profile%'
ORDER BY n.nspname, p.proname;

-- ============================================
-- STEP 3: Check for common Supabase trigger names
-- ============================================
-- Supabase sometimes creates triggers with these names:
-- - handle_new_user
-- - on_auth_user_created
-- - create_profile_for_user

SELECT 
    tgname AS trigger_name,
    tgenabled AS enabled
FROM pg_trigger
WHERE tgname IN (
    'handle_new_user',
    'on_auth_user_created', 
    'create_profile_for_user'
)
ORDER BY tgname;

-- ============================================
-- STEP 4: Find what function the trigger calls
-- ============================================
-- Check what function on_auth_user_created trigger uses
SELECT 
    t.tgname AS trigger_name,
    n.nspname AS function_schema,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS function_arguments
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE t.tgname = 'on_auth_user_created'
    AND t.tgrelid = 'auth.users'::regclass;

-- ============================================
-- STEP 5: Remove the trigger
-- ============================================
-- Drop the on_auth_user_created trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ============================================
-- STEP 6: Remove the function (optional)
-- ============================================
-- The function public.handle_new_user() is no longer needed
-- Uncomment the line below to remove it:
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Note: CASCADE will also drop any dependent objects
-- If you want to be safe, check if it's used elsewhere first:
SELECT 
    'Function usage check' AS info,
    COUNT(*) AS trigger_count
FROM pg_trigger
WHERE tgfoid = 'public.handle_new_user'::regproc;

