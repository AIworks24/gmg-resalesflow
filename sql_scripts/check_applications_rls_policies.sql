-- SQL Script to Check RLS Policies for Applications Table
-- Run this in your production database to diagnose RLS policy issues

-- 1. Check if RLS is enabled on applications table
SELECT 
    schemaname, 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE tablename = 'applications';

-- 2. Check all RLS policies on applications table  
SELECT 
    policyname,
    cmd,  -- Command type (INSERT, SELECT, UPDATE, DELETE, ALL)
    permissive, -- PERMISSIVE or RESTRICTIVE
    roles,
    qual,  -- USING clause (for SELECT/UPDATE/DELETE)
    with_check  -- WITH CHECK clause (for INSERT/UPDATE)
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'applications'
ORDER BY cmd, policyname;

-- 3. More detailed view of policies with full expressions
SELECT 
    pol.polname as policy_name,
    pol.polcmd as command,
    pol.polpermissive as permissive,
    pol.polroles as roles,
    pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
JOIN pg_namespace pn ON pc.relnamespace = pn.oid
WHERE pn.nspname = 'public' 
AND pc.relname = 'applications'
ORDER BY pol.polcmd, pol.polname;

-- 4. Check current user context (helpful for debugging)
SELECT 
    auth.uid() as current_user_id,
    auth.jwt() ->> 'email' as current_user_email;