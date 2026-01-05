-- Cleanup function for old AI processing jobs
-- This prevents the ai_processing_jobs table from growing indefinitely
-- and affecting main application performance

-- Function to archive/delete old completed or failed jobs
CREATE OR REPLACE FUNCTION cleanup_old_ai_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete completed jobs older than 7 days
  DELETE FROM ai_processing_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '7 days';
  
  -- Delete pending jobs that have been stuck for more than 1 hour
  -- (likely abandoned or failed to process)
  DELETE FROM ai_processing_jobs
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour';
  
  -- Log cleanup (optional - can be removed if not needed)
  RAISE NOTICE 'Cleaned up old AI processing jobs';
END;
$$;

-- Create a scheduled job using pg_cron (if available)
-- This will run daily at 2 AM to clean up old jobs
-- Note: pg_cron extension must be enabled in Supabase
-- SELECT cron.schedule(
--   'cleanup-ai-jobs',
--   '0 2 * * *', -- Daily at 2 AM
--   'SELECT cleanup_old_ai_jobs();'
-- );

-- Alternative: Create a trigger that cleans up when new jobs are created
-- This ensures cleanup happens automatically without requiring pg_cron
CREATE OR REPLACE FUNCTION trigger_cleanup_old_ai_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only run cleanup occasionally (every 100th job) to avoid performance impact
  IF (SELECT COUNT(*) FROM ai_processing_jobs) % 100 = 0 THEN
    PERFORM cleanup_old_ai_jobs();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on insert
DROP TRIGGER IF EXISTS cleanup_ai_jobs_trigger ON ai_processing_jobs;
CREATE TRIGGER cleanup_ai_jobs_trigger
  AFTER INSERT ON ai_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_old_ai_jobs();

-- Add index for cleanup queries (if not already exists)
CREATE INDEX IF NOT EXISTS idx_ai_jobs_cleanup 
  ON ai_processing_jobs(status, completed_at) 
  WHERE status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_ai_jobs_cleanup_pending 
  ON ai_processing_jobs(status, created_at) 
  WHERE status = 'pending';

-- Add comment explaining the cleanup strategy
COMMENT ON FUNCTION cleanup_old_ai_jobs() IS 
  'Cleans up old AI processing jobs to prevent database bloat. Deletes completed/failed jobs older than 7 days and pending jobs older than 1 hour.';

COMMENT ON FUNCTION trigger_cleanup_old_ai_jobs() IS 
  'Trigger function that runs cleanup every 100th job insertion to maintain table size without impacting performance.';

