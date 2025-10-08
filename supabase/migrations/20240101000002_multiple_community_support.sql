-- Multiple Community Support Migration
-- Adds support for property linking and multi-community transactions

-- Add is_multi_community flag to hoa_properties table (if not already added)
ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS is_multi_community BOOLEAN DEFAULT FALSE;

-- Create linked_properties table for property relationships
CREATE TABLE IF NOT EXISTS linked_properties (
    id SERIAL PRIMARY KEY,
    primary_property_id INTEGER NOT NULL REFERENCES hoa_properties(id) ON DELETE CASCADE,
    linked_property_id INTEGER NOT NULL REFERENCES hoa_properties(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent self-linking and duplicate links
    CONSTRAINT no_self_link CHECK (primary_property_id != linked_property_id),
    CONSTRAINT unique_property_link UNIQUE (primary_property_id, linked_property_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_linked_properties_primary ON linked_properties(primary_property_id);
CREATE INDEX IF NOT EXISTS idx_linked_properties_linked ON linked_properties(linked_property_id);

-- Add trigger to update updated_at timestamp for linked_properties
CREATE TRIGGER update_linked_properties_updated_at 
    BEFORE UPDATE ON linked_properties 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to get all linked properties for a given property
CREATE OR REPLACE FUNCTION get_linked_properties(property_id INTEGER)
RETURNS TABLE (
    linked_property_id INTEGER,
    property_name VARCHAR(255),
    location VARCHAR(255),
    property_owner_email VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.linked_property_id,
        hp.name as property_name,
        hp.location,
        hp.property_owner_email
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.linked_property_id = hp.id
    WHERE lp.primary_property_id = property_id
    ORDER BY hp.name;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if property has linked associations
CREATE OR REPLACE FUNCTION has_linked_properties(property_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    link_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO link_count
    FROM linked_properties
    WHERE primary_property_id = property_id;
    
    RETURN link_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to get all properties that link to a given property
CREATE OR REPLACE FUNCTION get_properties_linking_to(property_id INTEGER)
RETURNS TABLE (
    primary_property_id INTEGER,
    property_name VARCHAR(255),
    location VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.primary_property_id,
        hp.name as property_name,
        hp.location
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.primary_property_id = hp.id
    WHERE lp.linked_property_id = property_id
    ORDER BY hp.name;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate no circular references when adding links
CREATE OR REPLACE FUNCTION validate_no_circular_reference(
    primary_id INTEGER,
    linked_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    dup_count INTEGER;
BEGIN
    -- Block self-linking (A -> A)
    IF primary_id = linked_id THEN
        RETURN FALSE;
    END IF;

    -- Block exact duplicates only (existing A -> B)
    SELECT COUNT(*) INTO dup_count
    FROM linked_properties
    WHERE primary_property_id = primary_id
      AND linked_property_id = linked_id;

    RETURN dup_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for linked_properties table
ALTER TABLE linked_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for linked_properties" ON linked_properties
    FOR ALL USING (true);

-- Add comments
COMMENT ON TABLE linked_properties IS 'Stores relationships between properties for multi-community transactions';
COMMENT ON COLUMN linked_properties.primary_property_id IS 'The main property selected by the user';
COMMENT ON COLUMN linked_properties.linked_property_id IS 'Additional property that gets included automatically';
COMMENT ON COLUMN hoa_properties.is_multi_community IS 'Flag indicating if this property has linked associations';