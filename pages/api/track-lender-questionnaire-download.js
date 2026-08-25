import { createClient } from '@supabase/supabase-js';
import { appendProcessNote, resolveActorName } from '../../lib/processHistoryServer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const actor = await resolveActorName(req, res);
    if (!actor.authenticated) {
      console.warn(`[track-lq-download] unauthenticated call for application ${applicationId}`);
    }

    // Read the existing timestamp first: this endpoint fires on every click of
    // "Download Form", but only the first one is a process-history milestone.
    const { data: existing } = await supabase
      .from('applications')
      .select('lender_questionnaire_downloaded_at')
      .eq('id', applicationId)
      .single();

    // Update application record with download timestamp
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        lender_questionnaire_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Error updating application:', updateError);
      return res.status(500).json({ error: 'Failed to update application: ' + updateError.message });
    }

    // Log the first download only. Note this is also correctly suppressed when
    // an admin uploaded the original on the requester's behalf, since that route
    // pre-sets lender_questionnaire_downloaded_at and logs its own entry.
    if (!existing?.lender_questionnaire_downloaded_at) {
      await appendProcessNote(
        supabase,
        applicationId,
        `Original lender questionnaire downloaded by ${actor.name}.`
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Download tracked successfully',
    });
  } catch (error) {
    console.error('Error in track-lender-questionnaire-download:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}













