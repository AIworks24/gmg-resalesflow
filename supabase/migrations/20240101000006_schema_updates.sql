-- Schema Updates Migration
-- Applies the remaining schema changes from individual migration files

-- Migration 007: Make seller information optional
-- Remove NOT NULL constraint from seller_name
ALTER TABLE public.applications 
ALTER COLUMN seller_name DROP NOT NULL;

-- Ensure buyer_name remains required (in case it was changed)
ALTER TABLE public.applications 
ALTER COLUMN buyer_name SET NOT NULL;

-- Migration: Remove submitter_type check constraint to allow any string
-- This allows for new submitter types like 'settlement' without database constraints
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_submitter_type_check;

-- Add comment to document the change
COMMENT ON COLUMN applications.submitter_type IS 'Type of submitter - can be any string value (seller, realtor, builder, admin, settlement, etc.)';