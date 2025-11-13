-- Add columns to track lender questionnaire download and edit status
DO $$ 
BEGIN
    -- Track when the original form was downloaded (Task 1 completion)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_downloaded_at') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_downloaded_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Track edited PDF from SimplePDF editor
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_edited_file_path') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_edited_file_path VARCHAR(500);
    END IF;
    
    -- Track when PDF was edited
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'applications' AND column_name = 'lender_questionnaire_edited_at') THEN
        ALTER TABLE applications ADD COLUMN lender_questionnaire_edited_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

COMMENT ON COLUMN applications.lender_questionnaire_downloaded_at IS 'Timestamp when admin downloaded the original lender questionnaire form (Task 1 completion)';
COMMENT ON COLUMN applications.lender_questionnaire_edited_file_path IS 'Path to edited lender questionnaire form from SimplePDF editor';
COMMENT ON COLUMN applications.lender_questionnaire_edited_at IS 'Timestamp when PDF was edited using SimplePDF editor';






