-- Migration: Add default_assignee_email to hoa_properties
-- When multiple property owner emails exist, this specifies which one is the default assignee for new applications.
-- All emails continue to receive notifications; only the default is used for application assignment.

ALTER TABLE public.hoa_properties
ADD COLUMN IF NOT EXISTS default_assignee_email VARCHAR(255);

COMMENT ON COLUMN public.hoa_properties.default_assignee_email IS 'When multiple property_owner_email values exist, this email is used as the default assignee for new applications. All emails receive notifications.';
