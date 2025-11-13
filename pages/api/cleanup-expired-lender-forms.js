import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Cleanup API endpoint to delete expired lender questionnaire forms
 * This should be called by a cron job or scheduled task daily
 * Deletes original lender forms that are past their deletion date (30 days)
 */
export default async function handler(req, res) {
  // Optional: Add authentication/authorization check for cron jobs
  // For example, check for a secret token in headers
  const authToken = req.headers['x-cron-secret'];
  if (authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date().toISOString();

    // Find all applications with expired lender questionnaire deletion dates
    const { data: expiredApplications, error: fetchError } = await supabase
      .from('applications')
      .select('id, lender_questionnaire_file_path')
      .not('lender_questionnaire_file_path', 'is', null)
      .not('lender_questionnaire_deletion_date', 'is', null)
      .lte('lender_questionnaire_deletion_date', now);

    if (fetchError) {
      throw new Error('Failed to fetch expired applications: ' + fetchError.message);
    }

    if (!expiredApplications || expiredApplications.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No expired lender forms to delete',
        deletedCount: 0,
      });
    }

    // Delete files from storage
    const filesToDelete = expiredApplications
      .map(app => app.lender_questionnaire_file_path)
      .filter(path => path !== null);

    if (filesToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from('bucket0')
        .remove(filesToDelete);

      if (deleteError) {
        console.error('Error deleting files from storage:', deleteError);
        // Continue with database cleanup even if file deletion fails
      }
    }

    // Update applications to clear the file path and deletion date
    const applicationIds = expiredApplications.map(app => app.id);
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        lender_questionnaire_file_path: null,
        lender_questionnaire_deletion_date: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', applicationIds);

    if (updateError) {
      throw new Error('Failed to update applications: ' + updateError.message);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${expiredApplications.length} expired lender questionnaire form(s)`,
      deletedCount: expiredApplications.length,
      deletedFiles: filesToDelete,
    });
  } catch (error) {
    console.error('Error in cleanup-expired-lender-forms:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}











