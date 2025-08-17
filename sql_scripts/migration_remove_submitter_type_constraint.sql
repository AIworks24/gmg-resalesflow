-- Migration: Remove submitter_type check constraint to allow any string
-- This allows for new submitter types like 'settlement' without database constraints

-- Remove the existing check constraint on submitter_type
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_submitter_type_check;

-- Optional: Add a comment to document the change
COMMENT ON COLUMN applications.submitter_type IS 'Type of submitter - can be any string value (seller, realtor, builder, admin, settlement, etc.)';