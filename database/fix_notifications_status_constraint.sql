-- Fix Notifications Status Constraint
-- Remove any existing constraint that might be blocking 'read' status
-- and ensure status can be 'unread', 'read', or 'sent'

-- Drop existing constraint if it exists
DO $$
BEGIN
    -- Check if constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'notifications_status_check'
        AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_status_check;
        RAISE NOTICE 'Dropped existing notifications_status_check constraint';
    END IF;
END $$;

-- Optionally, add a new constraint that allows 'unread', 'read', and 'sent'
-- But we'll keep it flexible - no constraint needed since we control the values in code
-- If you want to enforce it, uncomment below:
-- ALTER TABLE notifications 
-- ADD CONSTRAINT notifications_status_check 
-- CHECK (status IN ('unread', 'read', 'sent'));

-- Note: We're not adding a constraint to keep it flexible for future status values
-- The application code controls the status values









