-- Migration 005: Add forms update tracking
-- This migration adds the forms_updated_at field for tracking form modifications
-- Used to determine when PDF needs regeneration (forms newer than PDF)

BEGIN;

-- Add form update tracking timestamp
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS forms_updated_at TIMESTAMP DEFAULT NOW();

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_applications_forms_updated_at ON public.applications(forms_updated_at);

-- Initialize existing records with their updated_at or created_at timestamp
UPDATE public.applications 
SET forms_updated_at = COALESCE(updated_at, created_at)
WHERE forms_updated_at IS NULL;

COMMIT;