-- Migration: Add settlement_assignee_email to hoa_properties
-- This column stores the default accounting user to auto-assign for settlement applications

ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS settlement_assignee_email TEXT;

COMMENT ON COLUMN hoa_properties.settlement_assignee_email IS
  'Default accounting user email assigned to settlement applications (settlement_va / settlement_nc) for this property';
