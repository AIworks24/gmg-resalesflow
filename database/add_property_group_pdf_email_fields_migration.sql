-- Add PDF and Email status fields to application_property_groups table
-- This enables individual PDF generation and email sending for each property in multi-community applications

-- Add PDF-related columns
ALTER TABLE application_property_groups 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS pdf_completed_at TIMESTAMP WITH TIME ZONE;

-- Add email-related columns  
ALTER TABLE application_property_groups
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS email_completed_at TIMESTAMP WITH TIME ZONE;

-- Add form_data column to store property-specific form data
ALTER TABLE application_property_groups
ADD COLUMN IF NOT EXISTS form_data JSONB;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_application_property_groups_pdf_status 
ON application_property_groups(pdf_status);

CREATE INDEX IF NOT EXISTS idx_application_property_groups_email_status 
ON application_property_groups(email_status);

-- Add constraints for status values
ALTER TABLE application_property_groups 
ADD CONSTRAINT check_pdf_status 
CHECK (pdf_status IN ('not_started', 'in_progress', 'completed', 'failed'));

ALTER TABLE application_property_groups 
ADD CONSTRAINT check_email_status 
CHECK (email_status IN ('not_started', 'in_progress', 'completed', 'failed'));

-- Add comments for documentation
COMMENT ON COLUMN application_property_groups.pdf_url IS 'URL to the generated PDF for this property';
COMMENT ON COLUMN application_property_groups.pdf_status IS 'Status of PDF generation for this property';
COMMENT ON COLUMN application_property_groups.pdf_completed_at IS 'Timestamp when PDF was completed for this property';
COMMENT ON COLUMN application_property_groups.email_status IS 'Status of email sending for this property';
COMMENT ON COLUMN application_property_groups.email_completed_at IS 'Timestamp when email was sent for this property';
COMMENT ON COLUMN application_property_groups.form_data IS 'Property-specific form data for PDF generation';