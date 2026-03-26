-- Stores old property owner data captured before groups are deleted during a correction.
-- The webhook uses this to send the correct emails to old vs. new property owners.
-- Cleared by the webhook after it processes the correction payment.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS correction_metadata JSONB DEFAULT NULL;
