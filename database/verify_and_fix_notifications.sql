-- Verify and Fix Notifications Table
-- Run this script to check and fix the notifications table structure

-- Step 1: Check if table exists and what columns it has
DO $$
BEGIN
    -- Check if table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        RAISE NOTICE 'Table notifications does not exist. Creating it...';
        
        -- Create the table
        CREATE TABLE notifications (
            id SERIAL PRIMARY KEY,
            application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
            recipient_email VARCHAR(255) NOT NULL,
            recipient_name VARCHAR(255),
            recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            notification_type VARCHAR(50) NOT NULL,
            subject VARCHAR(255),
            message TEXT,
            status VARCHAR(50) DEFAULT 'unread',
            is_read BOOLEAN DEFAULT FALSE,
            read_at TIMESTAMP WITH TIME ZONE,
            sent_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Table notifications created successfully.';
    ELSE
        RAISE NOTICE 'Table notifications exists. Checking columns...';
    END IF;
END $$;

-- Step 2: Add missing columns if they don't exist
DO $$
BEGIN
    -- Add recipient_user_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'recipient_user_id'
    ) THEN
        ALTER TABLE notifications ADD COLUMN recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added column recipient_user_id';
    END IF;
    
    -- Add recipient_name if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'recipient_name'
    ) THEN
        ALTER TABLE notifications ADD COLUMN recipient_name VARCHAR(255);
        RAISE NOTICE 'Added column recipient_name';
    END IF;
    
    -- Add status if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'status'
    ) THEN
        ALTER TABLE notifications ADD COLUMN status VARCHAR(50) DEFAULT 'unread';
        RAISE NOTICE 'Added column status';
    END IF;
    
    -- Add is_read if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'is_read'
    ) THEN
        ALTER TABLE notifications ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added column is_read';
    END IF;
    
    -- Add read_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'read_at'
    ) THEN
        ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added column read_at';
    END IF;
    
    -- Add metadata if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE notifications ADD COLUMN metadata JSONB;
        RAISE NOTICE 'Added column metadata';
    END IF;
    
    -- Add updated_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE notifications ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added column updated_at';
    END IF;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_application_id ON notifications(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications(notification_type);

-- Step 4: Create trigger for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Step 5: Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;

-- Policy: Users can read their own notifications
CREATE POLICY "Users can read their own notifications"
    ON notifications FOR SELECT
    USING (
        recipient_user_id = auth.uid() OR
        recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (
        recipient_user_id = auth.uid() OR
        recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Policy: Service role can insert notifications
CREATE POLICY "Service role can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- Step 7: Enable real-time replication
DO $$
BEGIN
    -- Check if table is already in replication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        RAISE NOTICE 'Enabled real-time replication for notifications table';
    ELSE
        RAISE NOTICE 'Real-time replication already enabled for notifications table';
    END IF;
END $$;

-- Step 8: Verify applications table replication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'applications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE applications;
        RAISE NOTICE 'Enabled real-time replication for applications table';
    ELSE
        RAISE NOTICE 'Real-time replication already enabled for applications table';
    END IF;
END $$;

-- Final verification: Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

