-- Add relationship comments to linked_properties table
-- This allows GMG staff to explain multi-community relationships to requestors

-- Add relationship_comment column to linked_properties table
ALTER TABLE linked_properties 
ADD COLUMN IF NOT EXISTS relationship_comment TEXT;

-- Drop the existing function before recreating with new signature
DROP FUNCTION IF EXISTS get_linked_properties(INTEGER);

-- Create the updated function with relationship_comment
CREATE FUNCTION get_linked_properties(property_id INTEGER)
RETURNS TABLE (
    linked_property_id INTEGER,
    property_name VARCHAR(255),
    location VARCHAR(255),
    property_owner_email VARCHAR(255),
    relationship_comment TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.linked_property_id,
        hp.name as property_name,
        hp.location,
        hp.property_owner_email,
        lp.relationship_comment
    FROM linked_properties lp
    JOIN hoa_properties hp ON lp.linked_property_id = hp.id
    WHERE lp.primary_property_id = property_id
    ORDER BY hp.name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN linked_properties.relationship_comment IS 'Explanation of why this property is linked (displayed to requestors to prevent ordering errors)';
