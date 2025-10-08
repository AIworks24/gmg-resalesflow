-- Property Documents Migration
-- Creates property_documents table for structured file management

-- Create property_documents table for structured file management
CREATE TABLE IF NOT EXISTS property_documents (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES hoa_properties(id) ON DELETE CASCADE,
    document_key VARCHAR(100) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_path TEXT,
    is_not_applicable BOOLEAN DEFAULT FALSE,
    expiration_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique document per property
    UNIQUE(property_id, document_key)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_property_documents_property_id ON property_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_expiration ON property_documents(expiration_date) WHERE expiration_date IS NOT NULL;

-- Create function to check for expiring documents (30 days)
CREATE OR REPLACE FUNCTION get_expiring_documents()
RETURNS TABLE (
    property_id INTEGER,
    property_name VARCHAR(255),
    document_name VARCHAR(255),
    expiration_date DATE,
    days_until_expiration INTEGER,
    property_owner_email VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pd.property_id,
        hp.name as property_name,
        pd.document_name,
        pd.expiration_date,
        (pd.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
        hp.property_owner_email
    FROM property_documents pd
    JOIN hoa_properties hp ON pd.property_id = hp.id
    WHERE pd.expiration_date IS NOT NULL
        AND pd.is_not_applicable = FALSE
        AND pd.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
        AND pd.expiration_date >= CURRENT_DATE
    ORDER BY pd.expiration_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_property_documents_updated_at 
    BEFORE UPDATE ON property_documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy
CREATE POLICY "Allow all operations for property_documents" ON property_documents
    FOR ALL USING (true);