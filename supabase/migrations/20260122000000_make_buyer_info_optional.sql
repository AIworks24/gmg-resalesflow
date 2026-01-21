-- Migration: Make buyer information optional
-- Purpose: Remove NOT NULL constraint from buyer_name to allow buyer info to be optional
-- Date: 2026-01-22
-- 
-- Buyer information should be optional, especially for settlement applications
-- where buyer info may not be required or available at submission time.

BEGIN;

-- Remove NOT NULL constraint from buyer_name
ALTER TABLE public.applications 
ALTER COLUMN buyer_name DROP NOT NULL;

-- buyer_email is already nullable, but ensure it stays that way
-- (No change needed, just documenting)

-- Add comment to document the change
COMMENT ON COLUMN public.applications.buyer_name IS 'Buyer name - optional field. Can be null for settlement applications or when buyer info is not available.';
COMMENT ON COLUMN public.applications.buyer_email IS 'Buyer email(s) - optional field. Can be null or empty for settlement applications or when buyer info is not available.';

COMMIT;
