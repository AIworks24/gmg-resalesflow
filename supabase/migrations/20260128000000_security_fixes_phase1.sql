-- =====================================================
-- PHASE 1 SECURITY FIXES
-- Created: 2026-01-28
-- Purpose: Fix critical security vulnerabilities before impersonation implementation
-- =====================================================

-- =====================================================
-- PART 1: FIX OVERLY PERMISSIVE RLS POLICIES
-- =====================================================

-- DROP dangerous policies that allow unauthenticated access
-- These policies use "using (true)" which allows ANY user (even unauthenticated) to access data

-- Policy 1: Allows anyone to view all applications (CRITICAL SECURITY ISSUE)
DROP POLICY IF EXISTS "Admins and staff can view all applications" ON public.applications;

-- Policy 2: Allows anyone to perform any operation on applications (CRITICAL SECURITY ISSUE)
DROP POLICY IF EXISTS "Allow all application operations" ON public.applications;

-- Update existing policies to include 'accounting' role
-- The existing "Admins and staff can manage all applications" policy only checks admin/staff
-- We need to update it to include accounting

DROP POLICY IF EXISTS "Admins and staff can manage all applications" ON public.applications;

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

-- Update "Users can update their own applications" to include accounting
DROP POLICY IF EXISTS "Users can update their own applications" ON public.applications;

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

-- Update "Users can view their own applications" to include accounting
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;

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

-- Policy 3: Fix overly permissive application_property_groups policies
DROP POLICY IF EXISTS "Allow read access to application property groups" ON public.application_property_groups;
DROP POLICY IF EXISTS "Allow update access to application property groups" ON public.application_property_groups;

-- Create properly scoped replacement policies for application_property_groups
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
-- PART 2: CREATE AUDIT LOGS TABLE
-- =====================================================

-- Create audit_logs table for tracking all admin actions and impersonation
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who performed the action
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Who they were acting as (for impersonation)
  acting_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- What action was performed
  action TEXT NOT NULL,
  
  -- What resource was affected
  resource_type TEXT NOT NULL,
  resource_id UUID,
  
  -- Additional context (JSON for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_action CHECK (action IS NOT NULL AND length(action) > 0),
  CONSTRAINT valid_resource_type CHECK (resource_type IS NOT NULL AND length(resource_type) > 0),
  
  -- At least one user ID must be present
  CONSTRAINT at_least_one_user CHECK (
    admin_user_id IS NOT NULL OR acting_user_id IS NOT NULL
  )
);

-- Minimal indexes for fast INSERTs + fast admin queries (fewer indexes = faster writes)
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_admin_created ON public.audit_logs(admin_user_id, created_at DESC) WHERE admin_user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_acting_created ON public.audit_logs(acting_user_id, created_at DESC) WHERE acting_user_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.audit_logs IS 'Comprehensive audit trail for all admin actions and user impersonation';
COMMENT ON COLUMN public.audit_logs.admin_user_id IS 'The actual admin user who performed the action (NULL for regular user actions)';
COMMENT ON COLUMN public.audit_logs.acting_user_id IS 'The user identity used for the action (different from admin_user_id during impersonation)';
COMMENT ON COLUMN public.audit_logs.action IS 'Action performed (e.g., impersonation_started, update_application, delete_application)';
COMMENT ON COLUMN public.audit_logs.resource_type IS 'Type of resource affected (e.g., user, application, payment)';
COMMENT ON COLUMN public.audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN public.audit_logs.metadata IS 'Additional context about the action (field changes, request data, etc.)';

-- =====================================================
-- PART 3: RLS POLICIES FOR AUDIT LOGS
-- =====================================================

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Only system (service role) can insert audit logs
-- This prevents tampering with audit trail
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- No one can update or delete audit logs (immutable audit trail)
-- Audit logs are append-only for integrity

-- =====================================================
-- PART 4: ADD AUDIT FIELDS TO APPLICATIONS TABLE
-- =====================================================

-- Add is_test_transaction flag for payment safety during impersonation
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS is_test_transaction BOOLEAN DEFAULT FALSE;

-- Add impersonation metadata
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS impersonation_metadata JSONB DEFAULT NULL;

-- Create index for querying test transactions
CREATE INDEX IF NOT EXISTS idx_applications_is_test_transaction 
  ON public.applications(is_test_transaction) 
  WHERE is_test_transaction = TRUE;

-- Add comments
COMMENT ON COLUMN public.applications.is_test_transaction IS 'TRUE if this transaction was created during admin impersonation (always test mode)';
COMMENT ON COLUMN public.applications.impersonation_metadata IS 'Metadata about impersonation session (admin_id, timestamp, etc.)';

-- =====================================================
-- PART 5: CREATE HELPER FUNCTION FOR AUDIT LOGGING
-- =====================================================

-- Create a convenience function for logging audit events
-- This can be called from other database triggers or functions
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_admin_user_id UUID,
  p_acting_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    admin_user_id,
    acting_user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    p_admin_user_id,
    p_acting_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_metadata,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.log_audit_event IS 'Helper function to insert audit log entries (callable via service role)';
