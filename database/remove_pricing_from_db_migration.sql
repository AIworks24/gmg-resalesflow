-- Remove Pricing from Database Migration
-- Moves pricing from database to environment variables
-- Run this script after implementing environment variable pricing

-- Remove pricing columns from application_types table
ALTER TABLE application_types DROP COLUMN IF EXISTS price_standard;
ALTER TABLE application_types DROP COLUMN IF EXISTS price_rush;

-- Add comment to document the change
COMMENT ON TABLE application_types IS 'Property-based application types: single_property, multi_community, settlement_va, settlement_nc, public_offering. Pricing now handled via environment variables.';

-- Verify the migration
SELECT 'Pricing columns removed successfully!' as status;
SELECT name, display_name, required_forms, allowed_roles, submit_property_files FROM application_types ORDER BY name;