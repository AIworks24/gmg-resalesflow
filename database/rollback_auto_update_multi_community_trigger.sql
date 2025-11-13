-- Rollback script for auto_update_multi_community_trigger
-- This script removes the triggers and functions created by auto_update_multi_community_trigger.sql
-- Run this if you need to undo the automatic is_multi_community update functionality

-- Drop triggers first (before dropping functions)
DROP TRIGGER IF EXISTS auto_update_multi_community_insert ON linked_properties;
DROP TRIGGER IF EXISTS auto_update_multi_community_delete ON linked_properties;
DROP TRIGGER IF EXISTS auto_update_multi_community_update ON linked_properties;

-- Drop the helper functions
DROP FUNCTION IF EXISTS update_is_multi_community_for_property(INTEGER);
DROP FUNCTION IF EXISTS update_is_multi_community();
DROP FUNCTION IF EXISTS sync_all_multi_community_flags();

-- Note: This rollback does NOT change existing is_multi_community values
-- Properties that were set to multi-community will remain as-is
-- If you want to reset all properties, you can run:
-- UPDATE hoa_properties SET is_multi_community = FALSE WHERE is_multi_community = TRUE;
-- (But be careful - this will affect all properties, not just those with links)

COMMENT ON TABLE linked_properties IS 'Rollback completed - triggers and functions removed';











