-- Initial Schema Migration
-- This migration consolidates the core database schema for the GMG Resale Flow system
-- Includes: applications, hoa_properties, and basic structure

-- Create applications table (if not exists)
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES hoa_properties(id) ON DELETE CASCADE,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    seller_name VARCHAR(255), -- Made optional in migration 007
    seller_email VARCHAR(255),
    submitter_type VARCHAR(50) NOT NULL, -- Constraint removed in migration_remove_submitter_type_constraint
    status VARCHAR(50) DEFAULT 'pending',
    application_type VARCHAR(50) DEFAULT 'standard' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create hoa_properties table (if not exists)
CREATE TABLE IF NOT EXISTS hoa_properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    property_owner_email VARCHAR(255),
    is_multi_community BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_applications_property_id ON applications(property_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_application_type ON applications(application_type);
CREATE INDEX IF NOT EXISTS idx_hoa_properties_multi_community ON hoa_properties(is_multi_community);

-- Create function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_applications_updated_at 
    BEFORE UPDATE ON applications 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hoa_properties_updated_at 
    BEFORE UPDATE ON hoa_properties 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_properties ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust based on your auth requirements)
CREATE POLICY "Allow all operations for applications" ON applications
    FOR ALL USING (true);

CREATE POLICY "Allow all operations for hoa_properties" ON hoa_properties
    FOR ALL USING (true);