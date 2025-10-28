-- Add settlement_form to the form_type CHECK constraint
-- This allows the property_owner_forms table to accept 'settlement_form' as a valid form type

-- First, drop the existing constraint if it exists
ALTER TABLE property_owner_forms 
DROP CONSTRAINT IF EXISTS property_owner_forms_form_type_check;

-- Add a new CHECK constraint that includes 'settlement_form'
ALTER TABLE property_owner_forms 
ADD CONSTRAINT property_owner_forms_form_type_check 
CHECK (form_type IN ('inspection_form', 'resale_certificate', 'settlement_form'));
