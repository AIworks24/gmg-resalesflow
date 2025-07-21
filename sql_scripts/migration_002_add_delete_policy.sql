-- Migration 002: Add DELETE policy for applications
-- Created: 2024-01-XX
-- Purpose: Allow users to delete their own draft and pending_payment applications

BEGIN;

-- Add DELETE policy for applications
-- Users can delete their own applications if they are in draft or pending_payment status
CREATE POLICY "Users can delete their own unpaid applications"
  ON public.applications
  FOR DELETE
  USING (
    auth.uid() = user_id AND
    status IN ('draft', 'pending_payment')
  );

-- Also add DELETE policy for property_owner_forms to ensure cascade works properly
CREATE POLICY "Users can delete their property owner forms"
  ON public.property_owner_forms
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_id
      AND applications.user_id = auth.uid()
      AND applications.status IN ('draft', 'pending_payment')
    )
  );

COMMIT;

-- Add comments for documentation
COMMENT ON POLICY "Users can delete their own unpaid applications" ON public.applications IS 'Allows users to delete their own applications that are in draft or pending_payment status';
COMMENT ON POLICY "Users can delete their property owner forms" ON public.property_owner_forms IS 'Allows users to delete property owner forms for their own unpaid applications'; 