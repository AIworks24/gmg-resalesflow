import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendApplicationSubmissionEmail, sendApprovalEmail, sendPaymentConfirmationEmail } from '../../lib/emailService';
import { resolveActingUser } from '../../lib/impersonation';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { emailType, ...emailData } = req.body;

    if (!emailType) {
      return res.status(400).json({ error: 'Email type is required' });
    }

    // Check if impersonating and if emails should be sent
    const identity = await resolveActingUser(req, res);
    const sendEmailsHeader = req.headers['x-impersonate-send-emails'];
    const shouldSendEmails = sendEmailsHeader === 'true';

    if (identity.isImpersonating && !shouldSendEmails) {
      console.log('[Impersonation] Skipping email - sendEmails is disabled');
      return res.status(200).json({ 
        success: true, 
        message: 'Email skipped (impersonation mode - emails disabled)',
        skipped: true
      });
    }

    let result;

    switch (emailType) {
      case 'application_submission':
        const {
          applicationId,
          customerName,
          customerEmail,
          propertyAddress,
          packageType,
          totalAmount,
          hoaName,
          submitterType,
          applicationType,
          linkedProperties,
          buyerName,
        } = emailData;

        // Validate required fields
        if (!applicationId || !customerName || !propertyAddress || !customerEmail) {
          return res.status(400).json({ 
            error: 'Missing required fields: applicationId, customerName, propertyAddress, customerEmail' 
          });
        }

        // For Builder/Developer or Licensed Realtor: address email to buyer name if present, else requester first name
        const isBuilderOrRealtor = submitterType === 'builder' || submitterType === 'realtor';
        const trimmedBuyerName = typeof buyerName === 'string' ? buyerName.trim() : '';
        const greetingName = isBuilderOrRealtor
          ? (trimmedBuyerName || (customerName.split(/\s+/)[0] || customerName))
          : customerName;

        // Fetch linked properties for multi-community applications if not provided
        // Note: We check for linked properties regardless of applicationType because
        // settlement agents can have settlement_va/settlement_nc type even for multi-community properties
        let linkedProps = linkedProperties || [];
        if (!linkedProps || linkedProps.length === 0) {
          try {
            const supabase = createPagesServerClient({ req, res });
            
            // First, try to get from application_property_groups (for paid applications)
            let linkedPropsData = [];
            const { data: propertyGroups } = await supabase
              .from('application_property_groups')
              .select('property_name, property_location, property_id')
              .eq('application_id', applicationId)
              .eq('is_primary', false);
            
            if (propertyGroups && propertyGroups.length > 0) {
              // Property groups exist (application has been paid)
              linkedPropsData = propertyGroups;
              console.log(`[EmailService] Found ${linkedPropsData.length} linked properties from property groups for application ${applicationId}`);
            } else {
              // Property groups don't exist yet (application not paid), fetch from linked_properties table
              // Get the application to find the property ID and check if it's multi-community
              const { data: application } = await supabase
                .from('applications')
                .select(`
                  hoa_property_id,
                  hoa_properties (
                    id,
                    is_multi_community
                  )
                `)
                .eq('id', applicationId)
                .single();
              
              if (application && application.hoa_property_id) {
                const isMultiCommunity = application.hoa_properties?.is_multi_community || false;
                
                if (isMultiCommunity) {
                  // Get linked properties using the RPC function
                  const { data: linkedPropsRpc, error: rpcError } = await supabase
                    .rpc('get_linked_properties', { property_id: application.hoa_property_id });
                  
                  if (rpcError) {
                    console.warn(`[EmailService] RPC error fetching linked properties:`, rpcError);
                  } else if (linkedPropsRpc && linkedPropsRpc.length > 0) {
                    // Map RPC result to our expected format
                    // RPC returns: linked_property_id, property_name, location, property_owner_email, relationship_comment
                    // Note: relationship_comment is fetched but not included in emails per requirements
                    linkedPropsData = linkedPropsRpc.map(prop => ({
                      property_name: prop.property_name,
                      property_location: prop.location,
                      property_id: prop.linked_property_id
                    }));
                    console.log(`[EmailService] Found ${linkedPropsData.length} linked properties from linked_properties table for application ${applicationId} (property_id: ${application.hoa_property_id})`);
                  } else {
                    console.log(`[EmailService] No linked properties found for property_id: ${application.hoa_property_id} (is_multi_community: ${isMultiCommunity})`);
                  }
                } else {
                  console.log(`[EmailService] Property ${application.hoa_property_id} is not marked as multi-community`);
                }
              } else {
                console.log(`[EmailService] Application ${applicationId} has no hoa_property_id`);
              }
            }
            
            linkedProps = linkedPropsData.map(prop => ({
              property_name: prop.property_name,
              location: prop.property_location || prop.location, // Map property_location to location for consistency
              property_id: prop.property_id
            }));
            
            console.log(`[EmailService] Total linked properties for application ${applicationId}: ${linkedProps.length}`);
          } catch (error) {
            console.warn('Could not fetch linked properties for application:', error.message);
          }
        }

        // Wrap email sending in try-catch so errors don't interrupt the process
        try {
          result = await sendApplicationSubmissionEmail({
            to: customerEmail, // Use the submitter email from application data
            applicationId,
            customerName: greetingName, // Builder/Realtor: buyer name if set, else requester first name
            propertyAddress,
            packageType,
            totalAmount,
            hoaName,
            submitterType,
            applicationType,
            linkedProperties: linkedProps,
          });
        } catch (emailError) {
          console.error('Failed to send application submission email:', emailError);
          // Don't throw - set result to indicate email failure but continue
          result = { success: false, error: emailError.message };
        }
        break;

      case 'payment_confirmation':
        // For admin use or webhook calls - require authentication
        const supabase = createPagesServerClient({ req, res });
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return res.status(401).json({ error: 'Unauthorized - Admin access required for payment confirmations' });
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile?.role !== 'admin' && profile?.role !== 'staff') {
          return res.status(403).json({ error: 'Forbidden - Admin access required for payment confirmations' });
        }

        // Wrap email sending in try-catch so errors don't interrupt the process
        try {
          result = await sendPaymentConfirmationEmail(emailData);
        } catch (emailError) {
          console.error('Failed to send payment confirmation email:', emailError);
          // Don't throw - set result to indicate email failure but continue
          result = { success: false, error: emailError.message };
        }
        break;

      case 'approval':
        // Redirect to existing approval email API
        return res.status(400).json({ 
          error: 'Use /api/send-approval-email for approval emails' 
        });

      default:
        return res.status(400).json({ error: 'Invalid email type' });
    }

    // Return success even if email failed - the process completed
    const emailSucceeded = result?.success !== false;
    return res.status(200).json({ 
      success: true, 
      message: emailSucceeded 
        ? `${emailType} email sent successfully`
        : `Process completed, but ${emailType} email delivery failed`,
      result,
      emailSent: emailSucceeded
    });

  } catch (error) {
    console.error(`Error sending ${req.body.emailType || 'unknown'} email:`, error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
} 