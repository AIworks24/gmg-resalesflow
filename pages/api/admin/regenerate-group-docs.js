import { createClient } from '@supabase/supabase-js';
import { generateMultiCommunityDocuments } from '../../../lib/settlementPdfService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { groupId, applicationId } = req.body;

    if (!groupId || !applicationId) {
      return res.status(400).json({ error: 'Group ID and Application ID are required' });
    }

    // Get the property group
    const { data: group, error: groupError } = await supabase
      .from('application_property_groups')
      .select('*')
      .eq('id', groupId)
      .eq('application_id', applicationId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Property group not found' });
    }

    // Get the application details
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Get the property details
    const { data: property, error: propError } = await supabase
      .from('hoa_properties')
      .select('*')
      .eq('id', group.property_id)
      .single();

    if (propError || !property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Create a single property array for this group
    const singleProperty = {
      id: property.id,
      name: property.name,
      location: property.location,
      property_owner_email: property.property_owner_email
    };

    // Generate documents for this specific property group
    const requiredForms = ['resale_certificate']; // Default forms, can be expanded
    const generatedDocs = await generateMultiCommunityDocuments(
      application,
      [singleProperty],
      null, // accountantUser - can be added later
      requiredForms
    );

    // Update group with generated documents
    await supabase
      .from('application_property_groups')
      .update({
        generated_docs: generatedDocs,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId);

    res.status(200).json({ 
      success: true, 
      message: `Documents regenerated successfully for ${group.property_name}`,
      generatedDocs: generatedDocs
    });

  } catch (error) {
    console.error('Error regenerating group docs:', error);
    res.status(500).json({ error: 'Failed to regenerate documents: ' + error.message });
  }
}