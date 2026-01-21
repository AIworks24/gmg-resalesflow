-- Check if a property has a multi_community_comment stored in the database
-- Replace 'VA Property' with the exact property name you want to check

SELECT 
  id,
  name,
  location,
  multi_community_comment,
  LENGTH(multi_community_comment) as comment_length,
  TRIM(multi_community_comment) as trimmed_comment,
  LENGTH(TRIM(multi_community_comment)) as trimmed_length,
  CASE 
    WHEN multi_community_comment IS NULL THEN 'NULL'
    WHEN TRIM(multi_community_comment) = '' THEN 'EMPTY_STRING'
    ELSE 'HAS_VALUE'
  END as comment_status
FROM hoa_properties
WHERE name = 'VA Property'  -- Change this to your property name
  AND deleted_at IS NULL;

-- To check ALL properties with comments:
-- SELECT name, multi_community_comment 
-- FROM hoa_properties 
-- WHERE multi_community_comment IS NOT NULL 
--   AND TRIM(multi_community_comment) != ''
--   AND deleted_at IS NULL;
