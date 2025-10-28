-- Updated Application Types Migration: Property-Based Application Types
-- Replaces submitter-based application types with property-based types
-- Phase 3: Refactor to property-focused application types

-- Update application_types table with new property-based types
-- First, clear existing data and insert new types
DELETE FROM application_types;

-- Insert new property-based application types
INSERT INTO application_types (name, display_name, required_forms, allowed_roles, submit_property_files, price_standard, price_rush) VALUES
-- Single Property - Regular HOA property
('single_property', 'Single Property Resale Certificate', 
 '["resale_certificate", "inspection_form"]', 
 '["staff"]', 
 true,      -- property files required
 31795,     -- $317.95 standard
 38861),    -- $388.61 rush (317.95 + 70.66)

-- Multi-Community - Master Association with linked/secondary properties
('multi_community', 'Multi-Community Resale Certificate',
 '["resale_certificate", "inspection_form"]',
 '["staff"]',
 true,      -- property files required
 31795,     -- $317.95 per property (handled by multiCommunityUtils)
 38861),    -- $388.61 per property rush

-- Settlement VA - Settlement agent for Virginia properties (FREE by law)
('settlement_va', 'Settlement Agent - Virginia',
 '["settlement_form"]',
 '["accounting"]',
 false,     -- no property files needed
 0,         -- FREE by Virginia law
 7066),     -- $70.66 rush only

-- Settlement NC - Settlement agent for North Carolina properties
('settlement_nc', 'Settlement Agent - North Carolina',
 '["settlement_form"]',
 '["accounting"]',
 false,     -- no property files needed
 45000,     -- $450.00 standard
 55000),    -- $550.00 rush

-- Public Offering - Public offering statement
('public_offering', 'Public Offering Statement',
 '[]',      -- no forms required, just document delivery
 '["staff"]',
 false,     -- no property files needed
 20000,     -- $200.00 standard
 27066)     -- $270.66 rush (200.00 + 70.66)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  required_forms = EXCLUDED.required_forms,
  allowed_roles = EXCLUDED.allowed_roles,
  submit_property_files = EXCLUDED.submit_property_files,
  price_standard = EXCLUDED.price_standard,
  price_rush = EXCLUDED.price_rush,
  updated_at = CURRENT_TIMESTAMP;

-- Update existing applications to use new application types
-- Map old application types to new ones
UPDATE applications SET application_type = 'single_property' 
WHERE application_type = 'standard';

UPDATE applications SET application_type = 'settlement_va' 
WHERE application_type = 'settlement_agent_va';

UPDATE applications SET application_type = 'settlement_nc' 
WHERE application_type = 'settlement_agent_nc';

UPDATE applications SET application_type = 'public_offering' 
WHERE application_type = 'public_offering_statement';

-- For multi-community applications, we need to detect them based on property
-- This will be handled by the application logic, but we can set a default
UPDATE applications SET application_type = 'single_property' 
WHERE application_type NOT IN ('single_property', 'multi_community', 'settlement_va', 'settlement_nc', 'public_offering');

-- Add comment to document the change
COMMENT ON TABLE application_types IS 'Property-based application types: single_property, multi_community, settlement_va, settlement_nc, public_offering';
COMMENT ON COLUMN applications.application_type IS 'Property-based application type: single_property, multi_community, settlement_va, settlement_nc, public_offering';