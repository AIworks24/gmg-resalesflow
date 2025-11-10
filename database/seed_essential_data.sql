-- Essential Reference Data Seed Script
-- Run this after setting up a new Supabase branch/project
-- This populates the minimum required data for the app to function

-- ============================================
-- 1. APPLICATION TYPES
-- ============================================
-- These define the available application types and their workflows
-- This is CRITICAL - the app requires these to function

INSERT INTO application_types (name, display_name, required_forms, allowed_roles, submit_property_files) VALUES
-- Single Property - Regular HOA property
('single_property', 'Single Property Resale Certificate', 
 '["resale_certificate", "inspection_form"]', 
 '["staff"]', 
 true),
-- Multi-Community - Master Association with linked/secondary properties
('multi_community', 'Multi-Community Resale Certificate',
 '["resale_certificate", "inspection_form"]',
 '["staff"]',
 true),
-- Settlement VA - Settlement agent for Virginia properties (FREE by law)
('settlement_va', 'Settlement Agent - Virginia',
 '["settlement_form"]',
 '["accounting"]',
 false),
-- Settlement NC - Settlement agent for North Carolina properties
('settlement_nc', 'Settlement Agent - North Carolina',
 '["settlement_form"]',
 '["accounting"]',
 false),
-- Public Offering - Public offering statement
('public_offering', 'Public Offering Statement',
 '[]',      -- no forms required, just document delivery
 '["staff"]',
 false)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  required_forms = EXCLUDED.required_forms,
  allowed_roles = EXCLUDED.allowed_roles,
  submit_property_files = EXCLUDED.submit_property_files,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- 2. PROPERTY OWNER FORMS LIST
-- ============================================
-- These define the available form types
-- This is CRITICAL - forms reference these types

INSERT INTO property_owner_forms_list (form_type, display_name, user_roles, description) VALUES
('inspection_form', 'Property Inspection Form', '["staff"]', 'Form for property inspection requests'),
('resale_certificate', 'Resale Certificate', '["staff"]', 'Standard HOA resale certificate'),
('settlement_form', 'Settlement Form', '["accounting"]', 'Settlement agent form for VA/NC properties - Dues Request/Escrow Instructions (VA) or Statement of Unpaid Assessments (NC)')
ON CONFLICT (form_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  user_roles = EXCLUDED.user_roles,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- 3. SAMPLE HOA PROPERTIES (Optional but Recommended)
-- ============================================
-- Create at least a few test properties for testing applications
-- You can modify these or import from production

-- Example test property (uncomment and modify as needed)
/*
INSERT INTO hoa_properties (name, location, property_owner_email, is_multi_community) VALUES
('Test Community HOA', 'Virginia', 'test@example.com', false)
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the seed data was inserted correctly

-- Check application types
SELECT 'Application Types' as table_name, COUNT(*) as count FROM application_types
UNION ALL
-- Check form types
SELECT 'Form Types' as table_name, COUNT(*) as count FROM property_owner_forms_list;

-- List all application types
SELECT name, display_name, required_forms, allowed_roles, submit_property_files 
FROM application_types 
ORDER BY name;

-- List all form types
SELECT form_type, display_name, user_roles, description 
FROM property_owner_forms_list 
ORDER BY form_type;

