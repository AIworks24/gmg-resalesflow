-- Auto-update is_multi_community trigger
-- This trigger automatically maintains is_multi_community based on linked_properties
-- When links are added/removed, the flag is automatically updated
--
-- ROLLBACK: If you need to undo this migration, run:
-- database/rollback_auto_update_multi_community_trigger.sql

-- Create function to update is_multi_community based on linked properties
CREATE OR REPLACE FUNCTION update_is_multi_community()
RETURNS TRIGGER AS $$
DECLARE
  primary_id INTEGER;
  has_links BOOLEAN;
BEGIN
  -- Determine which property ID to check
  IF TG_OP = 'INSERT' THEN
    primary_id := NEW.primary_property_id;
  ELSIF TG_OP = 'DELETE' THEN
    primary_id := OLD.primary_property_id;
  ELSE
    -- For UPDATE, check both old and new primary_property_id
    IF OLD.primary_property_id != NEW.primary_property_id THEN
      -- Link was moved to a different property, update both
      primary_id := OLD.primary_property_id;
      PERFORM update_is_multi_community_for_property(primary_id);
      primary_id := NEW.primary_property_id;
    ELSE
      primary_id := NEW.primary_property_id;
    END IF;
  END IF;

  -- Update the primary property
  PERFORM update_is_multi_community_for_property(primary_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Helper function to update is_multi_community for a specific property
CREATE OR REPLACE FUNCTION update_is_multi_community_for_property(prop_id INTEGER)
RETURNS VOID AS $$
DECLARE
  has_links BOOLEAN;
BEGIN
  -- Check if property has any linked properties
  SELECT EXISTS(
    SELECT 1 
    FROM linked_properties 
    WHERE primary_property_id = prop_id
  ) INTO has_links;

  -- Update is_multi_community based on whether links exist
  UPDATE hoa_properties
  SET is_multi_community = has_links,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = prop_id;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS auto_update_multi_community_insert ON linked_properties;
DROP TRIGGER IF EXISTS auto_update_multi_community_delete ON linked_properties;
DROP TRIGGER IF EXISTS auto_update_multi_community_update ON linked_properties;

-- Create triggers for INSERT, DELETE, and UPDATE
CREATE TRIGGER auto_update_multi_community_insert
  AFTER INSERT ON linked_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_is_multi_community();

CREATE TRIGGER auto_update_multi_community_delete
  AFTER DELETE ON linked_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_is_multi_community();

CREATE TRIGGER auto_update_multi_community_update
  AFTER UPDATE ON linked_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_is_multi_community();

-- Also create a function to sync all existing properties
CREATE OR REPLACE FUNCTION sync_all_multi_community_flags()
RETURNS VOID AS $$
BEGIN
  UPDATE hoa_properties hp
  SET is_multi_community = EXISTS(
    SELECT 1 
    FROM linked_properties lp 
    WHERE lp.primary_property_id = hp.id
  ),
  updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Run the sync to fix any existing properties
SELECT sync_all_multi_community_flags();

