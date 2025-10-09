-- Migration 007: Make seller information optional
-- This migration removes the NOT NULL constraints from seller fields
-- to make seller information optional while keeping buyer information required

BEGIN;

-- Remove NOT NULL constraint from seller_name
ALTER TABLE public.applications 
ALTER COLUMN seller_name DROP NOT NULL;

-- Ensure buyer_name remains required (in case it was changed)
ALTER TABLE public.applications 
ALTER COLUMN buyer_name SET NOT NULL;

COMMIT;
