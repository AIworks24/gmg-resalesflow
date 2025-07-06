-- Migration 001: Add payment-related columns to applications table
-- Created: 2024-01-XX
-- Purpose: Add missing payment tracking columns referenced in API endpoints

BEGIN;

-- Add payment status column
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending' 
CHECK (payment_status IN ('pending', 'completed', 'failed', 'canceled', 'refunded'));

-- Add Stripe-related columns for better payment tracking
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

-- Add payment timestamp columns
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS payment_canceled_at TIMESTAMP WITHOUT TIME ZONE;

-- Add payment failure reason for debugging
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_payment_status ON public.applications(payment_status);
CREATE INDEX IF NOT EXISTS idx_applications_stripe_session_id ON public.applications(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_applications_stripe_payment_intent_id ON public.applications(stripe_payment_intent_id);

-- Update existing applications to have consistent payment status
UPDATE public.applications 
SET payment_status = 'completed' 
WHERE status IN ('payment_confirmed', 'approved', 'completed') 
AND payment_status = 'pending';

UPDATE public.applications 
SET payment_status = 'pending' 
WHERE status IN ('draft', 'submitted', 'pending_payment') 
AND payment_status != 'pending';

COMMIT;

-- Add comments for documentation
COMMENT ON COLUMN public.applications.payment_status IS 'Tracks the current payment status: pending, completed, failed, canceled, refunded';
COMMENT ON COLUMN public.applications.stripe_session_id IS 'Stripe Checkout Session ID for tracking payments';
COMMENT ON COLUMN public.applications.stripe_payment_intent_id IS 'Stripe Payment Intent ID for tracking payments';
COMMENT ON COLUMN public.applications.payment_completed_at IS 'Timestamp when payment was successfully completed';
COMMENT ON COLUMN public.applications.payment_failed_at IS 'Timestamp when payment failed';
COMMENT ON COLUMN public.applications.payment_canceled_at IS 'Timestamp when payment was canceled';
COMMENT ON COLUMN public.applications.payment_failure_reason IS 'Reason for payment failure for debugging purposes'; 