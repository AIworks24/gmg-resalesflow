-- Add allow_public_offering column to hoa_properties table
-- This column controls whether a property can receive Public Offering Statement requests
-- Only properties with this flag enabled will show the Public Offering Statement option
-- under the Builder/Developer submitter type

-- Add allow_public_offering flag to hoa_properties table
ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS allow_public_offering BOOLEAN DEFAULT FALSE;

-- Create index for better performance when filtering properties
CREATE INDEX IF NOT EXISTS idx_hoa_properties_allow_public_offering 
ON hoa_properties(allow_public_offering);

-- Add comment to document the column
COMMENT ON COLUMN hoa_properties.allow_public_offering IS 
'Controls whether this property can receive Public Offering Statement requests. When TRUE, the Public Offering Statement option will be available under Builder/Developer submitter type. Defaults to FALSE.';











