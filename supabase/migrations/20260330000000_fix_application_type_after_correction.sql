-- Fix applications whose application_type doesn't match the actual property type
-- after a primary property correction. Specifically:
--   1. single_property/standard apps whose hoa_property_id points to an MC property → multi_community
--   2. multi_community apps whose hoa_property_id points to a non-MC property → single_property
-- Settlement types (settlement_va, settlement_nc) are intentionally excluded.

UPDATE applications
SET
  application_type = 'multi_community',
  updated_at       = now()
WHERE application_type IN ('single_property', 'standard')
  AND hoa_property_id IN (
    SELECT id FROM hoa_properties
    WHERE is_multi_community = true
      AND deleted_at IS NULL
  );

UPDATE applications
SET
  application_type = 'single_property',
  updated_at       = now()
WHERE application_type = 'multi_community'
  AND hoa_property_id IN (
    SELECT id FROM hoa_properties
    WHERE (is_multi_community = false OR is_multi_community IS NULL)
      AND deleted_at IS NULL
  );
