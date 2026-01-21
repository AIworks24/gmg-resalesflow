-- Add comment field for primary property in multi-community setups
-- This allows explaining the primary property's role to requestors

ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS multi_community_comment TEXT;

COMMENT ON COLUMN hoa_properties.multi_community_comment IS 'Explanation of this property role when it is the primary property in a multi-community setup';
