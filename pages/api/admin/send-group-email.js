import { createClient } from '@supabase/supabase-js';
import { sendPropertyManagerNotificationEmail } from '../../../lib/emailService';

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
      .select(`
        *,
        hoa_properties (
          name,
          location,
          property_owner_email
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Send email for this specific property group
    await sendPropertyManagerNotificationEmail({
      to: group.property_owner_email || application.hoa_properties.property_owner_email,
      applicationId: application.id,
      propertyName: group.property_name,
      propertyLocation: group.property_location,
      submitterName: application.submitter_name,
      submitterEmail: application.submitter_email,
      buyerName: application.buyer_name,
      sellerName: application.seller_name,
      salePrice: application.sale_price,
      closingDate: application.closing_date,
      packageType: application.package_type,
      isMultiCommunity: true,
      linkedProperties: [group], // Only this specific group
      generatedDocs: group.generated_docs || []
    });

    // Update group status
    await supabase
      .from('application_property_groups')
      .update({
        status: 'email_sent',
        email_sent_at: new Date().toISOString()
      })
      .eq('id', groupId);

    res.status(200).json({ 
      success: true, 
      message: `Email sent successfully for ${group.property_name}` 
    });

  } catch (error) {
    console.error('Error sending group email:', error);
    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
}