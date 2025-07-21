/*
This script updates the status field in the property_owner_forms table to use a new set of standardized values.

Purpose:
- Standardize the status field to use only these values: 'not_started', 'in_progress', 'completed', 'expired'
- Convert existing status values to the new format
- Add a constraint to ensure only valid status values can be used
- Set appropriate default value for new records

Changes made:
1. 'sent' status will become 'not_started'
2. 'opened' status will become 'in_progress'
3. 'completed' and 'expired' statuses remain the same
4. Any other status values will be set to 'not_started'
5. Adds a constraint to enforce these values
6. Sets default value to 'not_started'

The script is idempotent and can be run multiple times safely.
It includes diagnostic queries to show the before/after state of the data.
*/

-- Begin transaction
BEGIN;

-- First, let's see what values we have
CREATE TEMP TABLE status_values AS
SELECT DISTINCT status FROM property_owner_forms;

-- Drop existing constraint if any
ALTER TABLE property_owner_forms 
DROP CONSTRAINT IF EXISTS property_owner_forms_status_check;

-- Update existing records with explicit type casting
UPDATE property_owner_forms
SET status = 'not_started'::varchar
WHERE status IN ('sent', 'not_started');

UPDATE property_owner_forms
SET status = 'in_progress'::varchar
WHERE status IN ('opened', 'in_progress');

UPDATE property_owner_forms
SET status = 'completed'::varchar
WHERE status = 'completed';

UPDATE property_owner_forms
SET status = 'expired'::varchar
WHERE status = 'expired';

-- Handle any other values
UPDATE property_owner_forms
SET status = 'not_started'::varchar
WHERE status NOT IN ('not_started', 'in_progress', 'completed', 'expired');

-- Add new constraint with allowed values
ALTER TABLE property_owner_forms
ADD CONSTRAINT property_owner_forms_status_check
CHECK (status IN ('not_started'::varchar, 'in_progress'::varchar, 'completed'::varchar, 'expired'::varchar));

-- Set default value
ALTER TABLE property_owner_forms
ALTER COLUMN status SET DEFAULT 'not_started'::varchar;

-- Show the results
SELECT status, COUNT(*) FROM property_owner_forms GROUP BY status;

-- Show what values we had before
SELECT * FROM status_values;

-- Cleanup
DROP TABLE status_values;

COMMIT; 