-- Add inspection_status column to application_property_groups table
-- This enables individual inspection form tracking for each property in multi-community applications

-- Add inspection status column
ALTER TABLE application_property_groups 
ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS inspection_completed_at TIMESTAMP WITH TIME ZONE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_application_property_groups_inspection_status 
ON application_property_groups(inspection_status);

-- Add constraint for status values
ALTER TABLE application_property_groups 
ADD CONSTRAINT check_inspection_status 
CHECK (inspection_status IN ('not_started', 'in_progress', 'completed', 'failed'));

-- Add comments for documentation
COMMENT ON COLUMN application_property_groups.inspection_status IS 'Status of inspection form for this property';
COMMENT ON COLUMN application_property_groups.inspection_completed_at IS 'Timestamp when inspection form was completed for this property';

