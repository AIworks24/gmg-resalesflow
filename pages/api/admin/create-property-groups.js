import { createClient } from '@supabase/supabase-js';
import { createPropertyGroups } from '../../../lib/groupingService';

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

    // Get application details with property information
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

    // Check if it's a multi-community application
    if (!application.hoa_properties?.is_multi_community) {
      return res.status(400).json({ error: 'Application is not multi-community' });
    }

    // Get linked properties
    const { getLinkedProperties } = require('../../../lib/multiCommunityUtils');
    const linkedProperties = await getLinkedProperties(application.hoa_property_id);

    if (!linkedProperties || linkedProperties.length === 0) {
      return res.status(400).json({ error: 'No linked properties found' });
    }

    // Create property groups
    const groups = await createPropertyGroups(
      applicationId,
      application.hoa_properties,
      linkedProperties
    );

    res.status(200).json({ 
      success: true, 
      message: `Created ${groups.length} property groups for application ${applicationId}`,
      groups: groups
    });

  } catch (error) {
    console.error('Error creating property groups:', error);
    res.status(500).json({ error: 'Failed to create property groups: ' + error.message });
  }
}