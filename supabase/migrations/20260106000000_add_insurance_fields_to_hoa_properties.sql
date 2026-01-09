-- Migration: Add insurance information fields to hoa_properties table
-- This migration adds columns for storing insurance company and agent information

-- Add insurance information columns to hoa_properties table
ALTER TABLE public.hoa_properties
ADD COLUMN IF NOT EXISTS insurance_company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_agent_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_agent_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS insurance_agent_email VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN public.hoa_properties.insurance_company_name IS 'Name of the insurance company for the property';
COMMENT ON COLUMN public.hoa_properties.insurance_agent_name IS 'Name of the insurance agent';
COMMENT ON COLUMN public.hoa_properties.insurance_agent_phone IS 'Phone number of the insurance agent';
COMMENT ON COLUMN public.hoa_properties.insurance_agent_email IS 'Email address of the insurance agent';

