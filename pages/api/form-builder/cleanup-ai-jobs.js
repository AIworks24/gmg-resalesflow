import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * API endpoint to manually trigger cleanup of old AI processing jobs
 * This can be called via cron job or manually by admins
 * 
 * Security: Should be protected or called only from server-side
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Call the cleanup function
    const { data, error } = await supabase.rpc('cleanup_old_ai_jobs');

    if (error) {
      console.error('Error cleaning up AI jobs:', error);
      return res.status(500).json({
        error: 'Failed to cleanup AI jobs',
        message: error.message
      });
    }

    // Get count of remaining jobs for reporting
    const { count: totalCount } = await supabase
      .from('ai_processing_jobs')
      .select('*', { count: 'exact', head: true });

    const { count: activeCount } = await supabase
      .from('ai_processing_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']);

    return res.status(200).json({
      success: true,
      message: 'AI jobs cleaned up successfully',
      stats: {
        totalJobs: totalCount || 0,
        activeJobs: activeCount || 0
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      error: 'Failed to cleanup AI jobs',
      message: error.message
    });
  }
}

