-- Enable Supabase Realtime replication for application_property_groups
-- This is required so the admin dashboard receives real-time INSERT events
-- when property groups are created by the Stripe webhook for multi-community applications.
-- Without this, the tree view for secondary properties won't appear until a manual refresh.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'application_property_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE application_property_groups;
    RAISE NOTICE 'Enabled real-time replication for application_property_groups table';
  ELSE
    RAISE NOTICE 'Real-time replication already enabled for application_property_groups table';
  END IF;
END $$;
