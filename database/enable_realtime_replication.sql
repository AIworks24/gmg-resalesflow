-- Enable Realtime Replication for Applications Table
-- This migration enables real-time updates for the applications table
-- Run this in Supabase SQL Editor after enabling Realtime in the dashboard

-- Enable replication for the applications table
-- This allows real-time subscriptions to listen for INSERT, UPDATE, DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE applications;

-- Note: If the table is already in the publication, this will not error
-- You can verify replication is enabled by checking:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'applications';

-- Enable replication for notifications table (for real-time notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable replication for application_property_groups table
-- Required for multi-community applications so the tree view updates in real-time
-- when property groups are created by the Stripe webhook
ALTER PUBLICATION supabase_realtime ADD TABLE application_property_groups;

-- Optional: Enable replication for property_owner_forms if needed:
-- ALTER PUBLICATION supabase_realtime ADD TABLE property_owner_forms;

