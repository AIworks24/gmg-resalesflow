-- =====================================================
-- FIX: Accounting Role Application Visibility
-- Created: 2026-03-09
-- Purpose: Ensure accounting users can view all applications
-- Issue: Recent policy changes removed accounting role access to non-settlement applications
-- =====================================================

-- Drop existing view/manage policies that may only include admin/staff
DROP POLICY IF EXISTS "Admins and staff can manage all applications" ON public.applications;
DROP POLICY IF EXISTS "Admins, staff, and accounting can manage all applications" ON public.applications;
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can update their own applications" ON public.applications;

-- Create proper policy granting admin, staff, AND accounting full access to all applications
CREATE POLICY "Admins, staff, and accounting can manage all applications"
ON public.applications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff', 'accounting')
  )
);

-- Allow users to view their own applications (preserves requester access)
CREATE POLICY "Users can view their own applications"
ON public.applications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff', 'accounting')
  )
);

-- Allow admin/staff/accounting to update applications, plus owners for their own
CREATE POLICY "Users can update their own applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff', 'accounting')
  )
);

-- Also fix application_property_groups access for accounting role
DROP POLICY IF EXISTS "Users can view their own application property groups" ON public.application_property_groups;
DROP POLICY IF EXISTS "Users can update their own application property groups" ON public.application_property_groups;
DROP POLICY IF EXISTS "Users can insert application property groups for their applications" ON public.application_property_groups;

CREATE POLICY "Users can view their own application property groups"
ON public.application_property_groups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_property_groups.application_id
    AND (
      applications.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff', 'accounting')
      )
    )
  )
);

CREATE POLICY "Users can update their own application property groups"
ON public.application_property_groups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_property_groups.application_id
    AND (
      applications.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff', 'accounting')
      )
    )
  )
);

CREATE POLICY "Users can insert application property groups for their applications"
ON public.application_property_groups
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_property_groups.application_id
    AND (
      applications.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff', 'accounting')
      )
    )
  )
);

-- =====================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- =====================================================
-- Check policies on applications table:
-- SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'applications';
--
-- Verify accounting user can see all applications:
-- SET LOCAL role TO authenticated;
-- SET LOCAL "request.jwt.claims" TO '{"sub": "<accounting-user-uuid>"}';
-- SELECT count(*) FROM applications;
