-- Initialize inspection_status for existing property groups
-- This sets a default 'not_started' status for any groups that don't have it set yet
-- This ensures existing multi-community applications work correctly after adding the column

UPDATE application_property_groups 
SET inspection_status = 'not_started'
WHERE inspection_status IS NULL;

-- Optional: If you want to mark inspection_status as 'completed' for property groups
-- where there's already a completed inspection_form at the application level,
-- uncomment and modify the following query:
-- 
-- UPDATE application_property_groups 
-- SET inspection_status = 'completed',
--     inspection_completed_at = (
--       SELECT completed_at 
--       FROM property_owner_forms 
--       WHERE application_id = application_property_groups.application_id 
--         AND form_type = 'inspection_form' 
--         AND status = 'completed'
--       LIMIT 1
--     )
-- WHERE inspection_status IS NULL 
--   AND EXISTS (
--     SELECT 1 
--     FROM property_owner_forms 
--     WHERE application_id = application_property_groups.application_id 
--       AND form_type = 'inspection_form' 
--       AND status = 'completed'
--   );












