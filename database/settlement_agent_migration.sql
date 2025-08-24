-- Settlement Agent Migration: Application Types and Form Management
-- Creates tables to support settlement agent workflow with proper form routing
-- Phase 2: Adds data-driven architecture with pricing and workflow support

-- Create application_types table with new columns
CREATE TABLE IF NOT EXISTS application_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    required_forms JSONB NOT NULL DEFAULT '[]',
    allowed_roles JSONB NOT NULL DEFAULT '[]',
    submit_property_files BOOLEAN DEFAULT true,
    price_standard INTEGER DEFAULT 0,  -- cents
    price_rush INTEGER DEFAULT 0,      -- cents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create property_owner_forms_list table
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

-- Insert initial application types with pricing data
INSERT INTO application_types (name, display_name, required_forms, allowed_roles, submit_property_files, price_standard, price_rush) VALUES
-- Standard application (current workflow - unchanged)
('standard', 'Standard Resale Certificate', 
 '["resale_certificate", "inspection_form"]', 
 '["staff"]', 
 true,      -- property files required
 31795,     -- $317.95 standard
 38861),    -- $388.61 rush (317.95 + 70.66)

-- Settlement Agent - Virginia (FREE by law)
('settlement_agent_va', 'Settlement Agent - Virginia',
 '["settlement_form"]',
 '["accounting"]',
 false,     -- no property files needed
 0,         -- FREE by Virginia law
 7066),     -- $70.66 rush only

-- Settlement Agent - North Carolina (paid)  
('settlement_agent_nc', 'Settlement Agent - North Carolina',
 '["settlement_form"]',
 '["accounting"]', 
 false,     -- no property files needed
 45000,     -- $450.00 standard
 55000)     -- $550.00 rush
ON CONFLICT (name) DO NOTHING;

-- Insert initial form types
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

CREATE TRIGGER update_application_types_updated_at 
    BEFORE UPDATE ON application_types 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_owner_forms_updated_at 
    BEFORE UPDATE ON property_owner_forms_list 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add application_type column to applications table (string instead of foreign key for simplicity)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'application_type') THEN
        ALTER TABLE applications ADD COLUMN application_type VARCHAR(50) DEFAULT 'standard';
        
        -- Set default application type for existing applications
        UPDATE applications SET application_type = 'standard' WHERE application_type IS NULL;
        
        -- Add not null constraint after setting default values
        ALTER TABLE applications ALTER COLUMN application_type SET NOT NULL;
    END IF;
END $$;

-- Create index on the new application type column
CREATE INDEX IF NOT EXISTS idx_applications_application_type ON applications(application_type);