-- Diagnostic script to check for database triggers/functions that auto-create profiles
-- Run this in your main database to identify the issue

-- ============================================
-- CHECK 1: Look for triggers on auth.users
-- ============================================
SELECT 
    'Triggers on auth.users' AS check_type,
    trigger_name,
    event_manipulation,
    action_timing,
    action_orientation
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
    AND event_object_table = 'users'
ORDER BY trigger_name;

-- ============================================
-- CHECK 2: Look for functions that might create profiles
-- ============================================
SELECT 
    'Functions that reference profiles' AS check_type,
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND (
        routine_definition ILIKE '%profiles%'
        OR routine_definition ILIKE '%INSERT INTO profiles%'
        OR routine_definition ILIKE '%CREATE PROFILE%'
    )
ORDER BY routine_name;

-- ============================================
-- CHECK 3: Check for RPC functions that create profiles
-- ============================================
SELECT 
    'RPC Functions' AS check_type,
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND (
        p.proname ILIKE '%profile%'
        OR pg_get_functiondef(p.oid) ILIKE '%INSERT INTO profiles%'
    )
ORDER BY p.proname;

-- ============================================
-- CHECK 4: Find orphaned profiles (profiles without auth users)
-- ============================================
SELECT 
    'Orphaned Profiles' AS check_type,
    COUNT(*) AS orphaned_count
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id
);

-- Show some examples of orphaned profiles
SELECT 
    'Orphaned Profile Examples' AS check_type,
    id,
    email,
    role,
    created_at
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id
)
LIMIT 10;

-- ============================================
-- CHECK 5: Find profiles created but auth user deleted
-- ============================================
SELECT 
    'Profiles with deleted auth users' AS check_type,
    p.id,
    p.email,
    p.role,
    p.created_at
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id
)
LIMIT 10;

-- ============================================
-- CHECK 6: Check for Supabase default triggers
-- ============================================
-- Check triggers on profiles table
SELECT 
    tgname AS trigger_name,
    'public' AS schema_name,
    'profiles' AS table_name
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
    AND NOT tgisinternal;

-- Check triggers on auth.users table  
SELECT 
    tgname AS trigger_name,
    'auth' AS schema_name,
    'users' AS table_name
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
    AND NOT tgisinternal;

