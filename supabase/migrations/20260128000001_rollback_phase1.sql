-- =====================================================
-- ROLLBACK: Phase 1 Security Fixes
-- Created: 2026-01-28
-- Purpose: Reverse Phase 1 migration (NOT RECOMMENDED - re-enables security vulnerabilities)
-- 
-- ⚠️ WARNING: This rollback re-enables critical security vulnerabilities:
--   - Payment bypass vulnerability
--   - Unauthenticated data access
--   - No audit trail
-- 
-- Only use in emergency situations or for testing.
-- =====================================================

-- =====================================================
-- PART 1: DROP AUDIT LOGGING INFRASTRUCTURE
-- =====================================================

-- Drop helper function
DROP FUNCTION IF EXISTS public.log_audit_event CASCADE;

-- Drop all indexes on audit_logs
DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_admin_created;
DROP INDEX IF EXISTS public.idx_audit_logs_acting_created;

-- Drop RLS policies on audit_logs
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

-- Drop audit_logs table (CAUTION: This deletes all audit history!)
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- =====================================================
-- PART 2: REMOVE APPLICATION AUDIT FIELDS
-- =====================================================

-- Drop indexes on applications
DROP INDEX IF EXISTS public.idx_applications_is_test_transaction;

-- Remove columns from applications table
ALTER TABLE public.applications 
  DROP COLUMN IF EXISTS is_test_transaction;
ALTER TABLE public.applications 
  DROP COLUMN IF EXISTS impersonation_metadata;

-- =====================================================
-- PART 3: RESTORE OLD RLS POLICIES (DANGEROUS!)
-- =====================================================

-- Drop the secure policies we created
DROP POLICY IF EXISTS "Admins, staff, and accounting can manage all applications" ON public.applications;
DROP POLICY IF EXISTS "Users can update their own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;

DROP POLICY IF EXISTS "Users can view their own application property groups" ON public.application_property_groups;
DROP POLICY IF EXISTS "Users can update their own application property groups" ON public.application_property_groups;
DROP POLICY IF EXISTS "Users can insert application property groups for their applications" ON public.application_property_groups;

-- ⚠️ RECREATE THE DANGEROUS POLICIES (NOT RECOMMENDED!)
-- These policies allow unauthenticated access - MAJOR SECURITY RISK

-- Policy 1: Allows anyone to view all applications (CRITICAL SECURITY ISSUE)
CREATE POLICY "Admins and staff can view all applications"
ON public.applications
FOR SELECT
TO public
USING (true);

-- Policy 2: Allows anyone to perform any operation on applications (CRITICAL SECURITY ISSUE)
CREATE POLICY "Allow all application operations"
ON public.applications
FOR ALL
TO public
USING (true);

-- Policy 3: Allows anyone to create applications without authentication
CREATE POLICY "Users can create applications"
ON public.applications
FOR INSERT
TO public
WITH CHECK (true);

-- Policy 4: Restore overly permissive application_property_groups policies
CREATE POLICY "Allow read access to application property groups"
ON public.application_property_groups
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow update access to application property groups"
ON public.application_property_groups
FOR UPDATE
TO public
USING (true);

-- Restore the original admin/staff management policy (without accounting)
CREATE POLICY "Admins and staff can manage all applications"
ON public.applications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff')
  )
);

-- Restore original update policy (without accounting)
CREATE POLICY "Users can update their own applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff')
  )
);

-- Restore original view policy (without accounting)
CREATE POLICY "Users can view their own applications"
ON public.applications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff')
  )
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify audit_logs table is dropped
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name = 'audit_logs';
-- Should return 0 rows

-- Verify application columns removed
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'applications' 
-- AND column_name IN ('is_test_transaction', 'impersonation_metadata');
-- Should return 0 rows

-- Verify dangerous policies restored
-- SELECT policyname FROM pg_policies 
-- WHERE tablename = 'applications' 
-- AND (using = 'true' OR with_check = 'true');
-- Should return policies with using (true)

-- =====================================================
-- POST-ROLLBACK NOTES
-- =====================================================

-- After running this rollback:
-- 1. Your application will have CRITICAL security vulnerabilities
-- 2. Unauthenticated users can read/modify all applications
-- 3. No audit trail exists
-- 4. Payment test mode can be bypassed by clients
-- 5. Accounting role loses access (only admin/staff have access)

-- You MUST:
-- 1. Fix payment APIs to remove client-controlled test mode
-- 2. Re-run Phase 1 migration ASAP
-- 3. Review all security policies
-- 4. Consider this a temporary emergency rollback only
