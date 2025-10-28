-- Comprehensive Application Types Migration
-- Creates tables if they don't exist, then updates to property-based types
-- Run this script in your database console

-- Create application_types table with new columns (if it doesn't exist)
CREATE TABLE IF NOT EXISTS application_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    required_forms JSONB NOT NULL DEFAULT '[]',
    allowed_roles JSONB NOT NULL DEFAULT '[]',
    submit_property_files BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create property_owner_forms_list table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS property_owner_forms_list (
    id SERIAL PRIMARY KEY,
    form_type VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    user_roles JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_application_types_name ON application_types(name);
CREATE INDEX IF NOT EXISTS idx_property_owner_forms_form_type ON property_owner_forms_list(form_type);

-- Clear existing application types and insert new property-based types
DELETE FROM application_types;

-- Insert new property-based application types
INSERT INTO application_types (name, display_name, required_forms, allowed_roles, submit_property_files) VALUES
-- Single Property - Regular HOA property
('single_property', 'Single Property Resale Certificate', 
 '["resale_certificate", "inspection_form"]', 
 '["staff"]', 
 true),      -- property files required

-- Multi-Community - Master Association with linked/secondary properties
('multi_community', 'Multi-Community Resale Certificate',
 '["resale_certificate", "inspection_form"]',
 '["staff"]',
 true),      -- property files required

-- Settlement VA - Settlement agent for Virginia properties (FREE by law)
('settlement_va', 'Settlement Agent - Virginia',
 '["settlement_form"]',
 '["accounting"]',
 false),     -- no property files needed

-- Settlement NC - Settlement agent for North Carolina properties
('settlement_nc', 'Settlement Agent - North Carolina',
 '["settlement_form"]',
 '["accounting"]',
 false),     -- no property files needed

-- Public Offering - Public offering statement
('public_offering', 'Public Offering Statement',
 '[]',      -- no forms required, just document delivery
 '["staff"]',
 false)     -- no property files needed
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  required_forms = EXCLUDED.required_forms,
  allowed_roles = EXCLUDED.allowed_roles,
  submit_property_files = EXCLUDED.submit_property_files,
  updated_at = CURRENT_TIMESTAMP;

-- Insert initial form types (if they don't exist)
INSERT INTO property_owner_forms_list (form_type, display_name, user_roles, description) VALUES
('inspection_form', 'Property Inspection Form', '["staff"]', 'Form for property inspection requests'),
('resale_certificate', 'Resale Certificate', '["staff"]', 'Standard HOA resale certificate'),
('settlement_form', 'Settlement Form', '["accounting"]', 'Settlement agent form for VA/NC properties - Dues Request/Escrow Instructions (VA) or Statement of Unpaid Assessments (NC)')
ON CONFLICT (form_type) DO NOTHING;

-- Add update triggers for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers (drop first to avoid conflicts)
DROP TRIGGER IF EXISTS update_application_types_updated_at ON application_types;
CREATE TRIGGER update_application_types_updated_at 
    BEFORE UPDATE ON application_types 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_owner_forms_updated_at ON property_owner_forms_list;
CREATE TRIGGER update_property_owner_forms_updated_at 
    BEFORE UPDATE ON property_owner_forms_list 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add application_type column to applications table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'application_type') THEN
        ALTER TABLE applications ADD COLUMN application_type VARCHAR(50) DEFAULT 'single_property';
        
        -- Set default application type for existing applications
        UPDATE applications SET application_type = 'single_property' WHERE application_type IS NULL;
        
        -- Add not null constraint after setting default values
        ALTER TABLE applications ALTER COLUMN application_type SET NOT NULL;
    END IF;
END $$;

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

-- Create index on the application type column
CREATE INDEX IF NOT EXISTS idx_applications_application_type ON applications(application_type);

-- Add comments to document the change
COMMENT ON TABLE application_types IS 'Property-based application types: single_property, multi_community, settlement_va, settlement_nc, public_offering. Pricing now handled via environment variables.';
COMMENT ON COLUMN applications.application_type IS 'Property-based application type: single_property, multi_community, settlement_va, settlement_nc, public_offering';

-- Verify the migration
SELECT 'Migration completed successfully!' as status;
SELECT name, display_name, required_forms, allowed_roles, submit_property_files FROM application_types ORDER BY name;