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

    // Simulate the webhook logic
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties (
          id,
          name,
          location,
          property_owner_email,
          is_multi_community
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if it's multi-community
    if (!application.hoa_properties?.is_multi_community) {
      return res.status(400).json({ error: 'Application is not multi-community' });
    }

    // Get linked properties
    const { getLinkedProperties } = require('../../../lib/multiCommunityUtils');
    const linkedProperties = await getLinkedProperties(application.hoa_property_id);

    if (!linkedProperties || linkedProperties.length === 0) {
      return res.status(400).json({ error: 'No linked properties found' });
    }

    // Check if property groups already exist
    const { data: existingGroups } = await supabase
      .from('application_property_groups')
      .select('id')
      .eq('application_id', applicationId);

    let groups = [];
    if (existingGroups && existingGroups.length > 0) {
      // Property groups already exist
      groups = existingGroups;
      console.log(`Property groups already exist for application ${applicationId}`);
    } else {
      // Create property groups
      const { createPropertyGroups } = require('../../../lib/groupingService');
      groups = await createPropertyGroups(
        applicationId,
        application.hoa_properties,
        linkedProperties
      );
    }

    // Update application status
    await supabase
      .from('applications')
      .update({
        status: 'payment_completed',
        payment_completed_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    res.status(200).json({ 
      success: true, 
      message: `Webhook logic executed successfully for application ${applicationId}`,
      groups: groups.length
    });

  } catch (error) {
    console.error('Error executing webhook logic:', error);
    res.status(500).json({ error: 'Failed to execute webhook logic: ' + error.message });
  }
}