-- Fix Notifications RLS Policy
-- The current policy tries to access auth.users table which causes permission errors
-- This script fixes the RLS policies to work correctly

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

-- Create improved RLS policies
-- Policy: Users can read their own notifications
-- Uses profiles table instead of auth.users to avoid permission issues
CREATE POLICY "Users can read their own notifications"
    ON notifications FOR SELECT
    USING (
        recipient_user_id = auth.uid() OR
        recipient_email IN (
            SELECT email FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can update their own notifications (mark as read)
-- Uses profiles table instead of auth.users to avoid permission issues
CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (
        recipient_user_id = auth.uid() OR
        recipient_email IN (
            SELECT email FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        recipient_user_id = auth.uid() OR
        recipient_email IN (
            SELECT email FROM profiles WHERE id = auth.uid()
        )
    );

-- Note: For admin/staff/accounting users who are property owners,
-- the API endpoint handles the additional filtering by property owner email
-- The RLS policy ensures basic security, and the API adds the property owner matching logic




