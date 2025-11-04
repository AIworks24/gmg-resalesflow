-- Lender Questionnaire Application Migration
-- Adds support for lender questionnaire application type with file storage

-- Add lender questionnaire to application_types table
-- Note: Pricing is handled via environment variables (LENDER_QUESTIONNAIRE_BASE_PRICE, LENDER_QUESTIONNAIRE_RUSH_FEE)
-- The application_types table does not include price columns (removed in favor of ENV vars)
INSERT INTO application_types (name, display_name, required_forms, allowed_roles, submit_property_files) 
VALUES (
  'lender_questionnaire',
  'Lender Questionnaire',
  '["lender_questionnaire"]',
  '["staff"]',
  false        -- No property files needed
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  required_forms = EXCLUDED.required_forms,
  allowed_roles = EXCLUDED.allowed_roles,
  submit_property_files = EXCLUDED.submit_property_files,
  updated_at = CURRENT_TIMESTAMP;

-- Add lender_questionnaire form type to property_owner_forms_list (if it doesn't exist)
INSERT INTO property_owner_forms_list (form_type, display_name, user_roles, description) VALUES
('lender_questionnaire', 'Lender Questionnaire', '["staff"]', 'Custom lender questionnaire form uploaded by user')
ON CONFLICT (form_type) DO NOTHING;

-- Add columns to applications table for lender questionnaire files
DO $$ 
BEGIN
    -- Original lender form uploaded by user
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_file_path') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_file_path VARCHAR(500);
    END IF;
    
    -- Deletion date for original form (30 days after upload)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_deletion_date') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_deletion_date TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Completed form uploaded by staff
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_completed_file_path') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_completed_file_path VARCHAR(500);
    END IF;
    
    -- Upload date for completed form
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_completed_uploaded_at') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_completed_uploaded_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create index for faster lookup of applications with lender questionnaire files
CREATE INDEX IF NOT EXISTS idx_applications_lender_questionnaire_deletion 
ON applications(lender_questionnaire_deletion_date) 
WHERE lender_questionnaire_deletion_date IS NOT NULL;

COMMENT ON COLUMN applications.lender_questionnaire_file_path IS 'Path to original lender questionnaire form uploaded by user';
COMMENT ON COLUMN applications.lender_questionnaire_deletion_date IS 'Date when original lender form should be deleted (30 days after upload)';
COMMENT ON COLUMN applications.lender_questionnaire_completed_file_path IS 'Path to completed lender questionnaire form uploaded by staff';
COMMENT ON COLUMN applications.lender_questionnaire_completed_uploaded_at IS 'Timestamp when completed form was uploaded by staff';

