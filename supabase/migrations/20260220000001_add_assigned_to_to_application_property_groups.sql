-- Add assigned_to to application_property_groups for per-property staff assignment in multi-community
-- (Standalone migration for databases where 20260220000000 was applied before this column was added)

ALTER TABLE public.application_property_groups
ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

COMMENT ON COLUMN public.application_property_groups.assigned_to IS 'Staff member (email) assigned to handle this property in a multi-community application.';
