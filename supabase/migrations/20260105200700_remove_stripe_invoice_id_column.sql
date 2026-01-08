-- Remove stripe_invoice_id column from applications table
-- This column was added for invoice tracking but we now use Stripe receipts instead
-- Note: This migration uses IF EXISTS to safely handle cases where the column/index may not exist

-- Drop the index first (required before dropping column)
DROP INDEX IF EXISTS public.idx_applications_stripe_invoice_id;

-- Remove the column
ALTER TABLE public.applications 
DROP COLUMN IF EXISTS stripe_invoice_id;

-- Verify removal
COMMENT ON TABLE public.applications IS 'stripe_invoice_id column removed - using Stripe receipts instead of invoices';


