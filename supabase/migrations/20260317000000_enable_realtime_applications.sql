-- Enable Supabase Realtime replication for applications table
-- This is required so the admin dashboard receives real-time INSERT/UPDATE/DELETE events
-- for the applications table, keeping the total application count and other metrics
-- up to date without requiring a manual refresh.

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
