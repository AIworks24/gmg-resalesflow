-- Migration 006: Add task completion tracking and PDF expiry management
-- This migration adds completion timestamps for each workflow task and PDF lifecycle management

BEGIN;

-- Add task completion tracking fields
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS inspection_form_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS resale_certificate_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS pdf_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS comments TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_applications_task_completion ON public.applications(inspection_form_completed_at, resale_certificate_completed_at, pdf_completed_at, email_completed_at);

-- Update existing records only if columns exist
DO $$
BEGIN
    -- Check if pdf_generated_at column exists before updating
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'pdf_generated_at') THEN
        -- Set PDF completed if PDF exists
        UPDATE public.applications 
        SET pdf_completed_at = pdf_generated_at
        WHERE pdf_generated_at IS NOT NULL AND pdf_completed_at IS NULL;
    END IF;
    
    -- Set completion timestamps for existing records based on current status
    -- Set inspection form completed if form exists and is completed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'property_owner_forms') THEN
        UPDATE public.applications a
        SET inspection_form_completed_at = pof.completed_at
        FROM property_owner_forms pof
        WHERE a.id = pof.application_id 
        AND pof.form_type = 'inspection_form' 
        AND pof.status = 'completed'
        AND a.inspection_form_completed_at IS NULL;

        -- Set resale certificate completed if form exists and is completed  
        UPDATE public.applications a
        SET resale_certificate_completed_at = pof.completed_at
        FROM property_owner_forms pof
        WHERE a.id = pof.application_id 
        AND pof.form_type = 'resale_certificate' 
        AND pof.status = 'completed'
        AND a.resale_certificate_completed_at IS NULL;
    END IF;

    -- Set email completed if approval notification exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        UPDATE public.applications a
        SET email_completed_at = n.sent_at
        FROM notifications n
        WHERE a.id = n.application_id 
        AND n.notification_type = 'application_approved'
        AND n.status = 'sent'
        AND a.email_completed_at IS NULL;
    END IF;
END $$;

COMMIT;