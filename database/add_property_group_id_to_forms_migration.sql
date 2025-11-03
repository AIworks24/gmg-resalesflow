-- Add property_group_id column to property_owner_forms table
-- This allows forms to be associated with specific property groups in multi-community applications

ALTER TABLE property_owner_forms 
ADD COLUMN IF NOT EXISTS property_group_id INTEGER REFERENCES application_property_groups(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_property_owner_forms_property_group_id 
ON property_owner_forms(property_group_id);

-- Add comment for documentation
COMMENT ON COLUMN property_owner_forms.property_group_id IS 'Reference to application_property_groups for multi-community applications';

