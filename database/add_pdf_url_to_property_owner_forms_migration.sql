-- Add pdf_url column to property_owner_forms table
-- This allows settlement forms to store the generated PDF URL

ALTER TABLE property_owner_forms 
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN property_owner_forms.pdf_url IS 'URL to the generated PDF document for this form';



