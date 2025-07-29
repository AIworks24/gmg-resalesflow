-- Migration: Add hoa_property_resale_templates table
-- This table stores reusable template data for Virginia Resale Certificate forms per property

BEGIN;

-- Create the hoa_property_resale_templates table
CREATE TABLE public.hoa_property_resale_templates (
  id integer NOT NULL DEFAULT nextval('property_owner_forms_id_seq'::regclass),
  hoa_property_id integer NOT NULL,
  template_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT hoa_property_resale_templates_pkey PRIMARY KEY (id),
  CONSTRAINT hoa_property_resale_templates_hoa_property_id_fkey FOREIGN KEY (hoa_property_id) REFERENCES public.hoa_properties(id) ON DELETE CASCADE,
  CONSTRAINT hoa_property_resale_templates_hoa_property_id_unique UNIQUE (hoa_property_id)
);

-- Enable Row Level Security
ALTER TABLE public.hoa_property_resale_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS Policy for authenticated users access
CREATE POLICY "Authenticated users can manage resale templates"
  ON public.hoa_property_resale_templates
  FOR ALL
  USING (auth.uid() IS NOT NULL);

COMMIT;