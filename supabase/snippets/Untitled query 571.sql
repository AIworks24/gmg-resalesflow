-- Quick check: Does the column exist?
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'linked_properties' 
AND column_name = 'relationship_comment';