import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
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
    // Verify user is authenticated and has admin role
    const supabaseAuth = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin, staff, or accounting role
    const { data: profile } = await supabaseAuth
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

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
    // Wrap email sending in try-catch so errors don't interrupt the process
    let emailSent = false;
    try {
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
      emailSent = true;
      console.log(`Group email sent successfully for ${group.property_name}`);
    } catch (emailError) {
      console.error(`Failed to send group email for ${group.property_name}:`, emailError);
      // Don't throw - continue with status updates even if email fails
      // The process should complete successfully even if email delivery fails
    }

    // Update group status regardless of email success/failure
    // This ensures the process completes even if email delivery fails
    const { error: updateError } = await supabase
      .from('application_property_groups')
      .update({
        email_status: emailSent ? 'completed' : 'failed',
        email_completed_at: emailSent ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId);

    if (updateError) {
      console.error('Failed to update group status:', updateError);
      // Still return success - the email attempt was made
    }

    res.status(200).json({ 
      success: true, 
      message: emailSent 
        ? `Email sent successfully for ${group.property_name}` 
        : `Process completed for ${group.property_name}, but email delivery failed`,
      emailSent
    });

  } catch (error) {
    console.error('Error sending group email:', error);
    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
}