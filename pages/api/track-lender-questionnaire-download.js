import { createClient } from '@supabase/supabase-js';

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

    return res.status(200).json({
      success: true,
      message: 'Download tracked successfully',
    });
  } catch (error) {
    console.error('Error in track-lender-questionnaire-download:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}






