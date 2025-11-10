import { createClient } from '@supabase/supabase-js';

/**
 * Format application type for display in notifications
 */
function formatApplicationType(applicationType) {
  const typeMap = {
    'single_property': 'Single Property',
    'multi_community': 'Multi-Community',
    'settlement_va': 'Settlement (VA)',
    'settlement_nc': 'Settlement (NC)',
    'lender_questionnaire': 'Lender Questionnaire',
    'public_offering': 'Public Offering',
  };
  
  return typeMap[applicationType] || applicationType || 'Application';
}

/**
 * Helper function to create notifications (can be called directly or via API)
 */
export async function createNotifications(applicationId, supabaseClient) {
  try {
    // Get full application data
    const { data: application, error: appError } = await supabaseClient
      .from('applications')
      .select(`
        *,
        hoa_properties (
          id,
          name,
          property_owner_email,
          property_owner_name
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Error fetching application for notifications:', appError);
      return { success: false, error: 'Application not found' };
    }

    // Skip if draft
    if (application.status === 'draft') {
      return { success: true, notificationsCreated: 0, message: 'Draft application, skipping notifications' };
    }

    const notifications = [];

    // 1. Notify Property Owner (if they have an account)
    if (application.hoa_properties?.property_owner_email) {
      const propertyOwnerEmail = application.hoa_properties.property_owner_email;
      
      // Find user ID by email
      const { data: ownerProfile } = await supabaseClient
        .from('profiles')
        .select('id, email, role')
        .eq('email', propertyOwnerEmail)
        .single();

      // Format application type for display
      const appTypeDisplay = formatApplicationType(application.application_type);
      const packageDisplay = application.package_type === 'rush' ? 'Rush' : 'Standard';
      
      const notification = {
        application_id: applicationId,
        recipient_email: propertyOwnerEmail,
        recipient_name: application.hoa_properties.property_owner_name || 'Property Owner',
        recipient_user_id: ownerProfile?.id || null,
        notification_type: 'new_application',
        subject: `${appTypeDisplay} Application - ${application.property_address} | ${application.hoa_properties?.name || 'Unknown Property'}`,
        message: `New ${appTypeDisplay.toLowerCase()} application received for ${application.property_address} in ${application.hoa_properties?.name || 'Unknown Property'}. Package: ${packageDisplay}. Submitter: ${application.submitter_name || 'Unknown'}.`,
        status: 'unread',
        is_read: false,
        metadata: {
          property_address: application.property_address,
          hoa_name: application.hoa_properties?.name,
          submitter_name: application.submitter_name,
          submitter_type: application.submitter_type,
          application_type: application.application_type,
          package_type: application.package_type,
        },
      };

      notifications.push(notification);
    }

    // 2. Notify all Staff/Admin users
    const { data: staffMembers } = await supabaseClient
      .from('profiles')
      .select('id, email, first_name, last_name, role')
      .in('role', ['admin', 'staff']);

    if (staffMembers && staffMembers.length > 0) {
      // Format application type for display
      const appTypeDisplay = formatApplicationType(application.application_type);
      const packageDisplay = application.package_type === 'rush' ? 'Rush' : 'Standard';
      const submitterInfo = application.submitter_name 
        ? `${application.submitter_name} (${application.submitter_type || 'Unknown'})`
        : application.submitter_type || 'Unknown submitter';
      
      staffMembers.forEach((staff) => {
        const notification = {
          application_id: applicationId,
          recipient_email: staff.email,
          recipient_name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || staff.email,
          recipient_user_id: staff.id,
          notification_type: 'new_application',
          subject: `${appTypeDisplay} Application - ${application.property_address} | ${application.hoa_properties?.name || 'Unknown Property'}`,
          message: `New ${appTypeDisplay.toLowerCase()} application requires processing. Property: ${application.property_address} in ${application.hoa_properties?.name || 'Unknown Property'}. Package: ${packageDisplay}. Submitter: ${submitterInfo}.`,
          status: 'unread',
          is_read: false,
          metadata: {
            property_address: application.property_address,
            hoa_name: application.hoa_properties?.name,
            submitter_name: application.submitter_name,
            submitter_type: application.submitter_type,
            application_type: application.application_type,
            package_type: application.package_type,
          },
        };

        notifications.push(notification);
      });
    }

    // Insert all notifications
    if (notifications.length > 0) {
      const { data, error } = await supabaseClient
        .from('notifications')
        .insert(notifications)
        .select();

      if (error) {
        console.error('Error creating notifications:', error);
        return { success: false, error: 'Failed to create notifications', details: error.message };
      }

      console.log(`Successfully created ${data.length} notifications for application ${applicationId}`);
      return {
        success: true,
        notificationsCreated: data.length,
        notifications: data,
      };
    }

    return {
      success: true,
      notificationsCreated: 0,
      message: 'No notifications to create',
    };
  } catch (error) {
    console.error('Error in createNotifications function:', error);
    return {
      success: false,
      error: 'Internal server error',
      details: error.message,
    };
  }
}

/**
 * API endpoint to create notifications
 * Called when applications are submitted to notify property owners and staff/admin
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const result = await createNotifications(applicationId, supabase);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in create notifications API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

