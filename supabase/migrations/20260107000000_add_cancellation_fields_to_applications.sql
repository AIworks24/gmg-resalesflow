-- Add cancellation and rejection tracking fields to applications table
-- This enables tracking when applications are cancelled or rejected

-- Add cancelled_at timestamp
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Add rejected_at timestamp
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for better performance when filtering cancelled/rejected applications
CREATE INDEX IF NOT EXISTS idx_applications_cancelled_at 
ON applications(cancelled_at) 
WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_rejected_at 
ON applications(rejected_at) 
WHERE rejected_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN applications.cancelled_at IS 'Timestamp when application was cancelled';
COMMENT ON COLUMN applications.rejected_at IS 'Timestamp when application was rejected';

-- Update status constraint to include 'cancelled' status
-- First, drop the existing constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'applications_status_check'
    ) THEN
        ALTER TABLE applications DROP CONSTRAINT applications_status_check;
        RAISE NOTICE 'Dropped existing applications_status_check constraint';
    END IF;
END $$;

-- Add the updated constraint with 'cancelled' status
ALTER TABLE applications 
ADD CONSTRAINT applications_status_check 
CHECK (
    (status)::text = ANY (
        ARRAY[
            ('draft'::character varying)::text,
            ('submitted'::character varying)::text,
            ('pending_payment'::character varying)::text,
            ('payment_confirmed'::character varying)::text,
            ('under_review'::character varying)::text,
            ('compliance_pending'::character varying)::text,
            ('compliance_completed'::character varying)::text,
            ('documents_generated'::character varying)::text,
            ('approved'::character varying)::text,
            ('completed'::character varying)::text,
            ('rejected'::character varying)::text,
            ('cancelled'::character varying)::text,
            ('awaiting_property_owner_response'::character varying)::text
        ]
    )
);
