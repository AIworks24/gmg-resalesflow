-- Add settlement_form_completed_at column to applications table
-- This column tracks when the settlement form task is completed

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS settlement_form_completed_at TIMESTAMP WITH TIME ZONE;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_settlement_form_completed_at 
ON applications(settlement_form_completed_at);

-- Add a comment to document the column
COMMENT ON COLUMN applications.settlement_form_completed_at IS 'Timestamp when settlement form task was completed';
