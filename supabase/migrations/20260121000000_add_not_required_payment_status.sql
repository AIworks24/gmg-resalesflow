-- Migration: Add 'not_required' to payment_status constraint
-- Purpose: Allow payment_status = 'not_required' for free transactions (e.g., Virginia standard settlements)
-- Date: 2026-01-21

-- Drop existing constraint
ALTER TABLE applications 
DROP CONSTRAINT IF EXISTS applications_payment_status_check;

-- Add new constraint with 'not_required'
ALTER TABLE applications 
ADD CONSTRAINT applications_payment_status_check 
CHECK (
    payment_status IN (
        'pending',
        'completed',
        'failed',
        'canceled',
        'refunded',
        'not_required'
    )
);

-- Add documentation
COMMENT ON CONSTRAINT applications_payment_status_check ON applications 
IS 'Valid payment statuses. not_required = free transactions (e.g., VA standard settlements)';

-- Update existing VA standard settlements to 'not_required'
UPDATE applications
SET 
    payment_status = 'not_required',
    updated_at = NOW()
WHERE 
    application_type IN ('settlement_va', 'settlement_agent_va')
    AND package_type = 'standard'
    AND (total_amount = 0 OR total_amount IS NULL)
    AND payment_status != 'not_required'
    AND status NOT IN ('draft', 'pending_payment')
    AND deleted_at IS NULL
    AND NOT EXISTS (
        SELECT 1 
        FROM application_property_groups apg 
        WHERE apg.application_id = applications.id
    );

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_payment_status 
ON applications(payment_status) 
WHERE deleted_at IS NULL;
