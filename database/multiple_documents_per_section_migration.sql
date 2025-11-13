-- Migration: Support multiple documents per document section
-- This removes the unique constraint and adds a display_name field for better UX

-- Step 1: Add display_name column (optional field to help identify documents)
ALTER TABLE property_documents 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Step 2: Add file_name column to store original filename
ALTER TABLE property_documents 
ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- Step 3: Remove the unique constraint that prevents multiple documents per section
ALTER TABLE property_documents 
DROP CONSTRAINT IF EXISTS property_documents_property_id_document_key_key;

-- Step 4: Create a new composite index for better query performance
CREATE INDEX IF NOT EXISTS idx_property_documents_property_key 
ON property_documents(property_id, document_key);

-- Step 5: Update display_name for existing records if null
UPDATE property_documents 
SET display_name = document_name 
WHERE display_name IS NULL;

-- Note: This migration allows multiple documents per document_key per property
-- Each document can have its own expiration_date, file_path, and display_name











