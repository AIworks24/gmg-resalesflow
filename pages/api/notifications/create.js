import { createClient } from '@supabase/supabase-js';
import { sendPropertyManagerNotificationEmail } from '../../../lib/emailService';
import { parseEmails } from '../../../lib/emailUtils';

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
 * Check if an email is a fake/placeholder email that shouldn't receive notifications
 */
function isFakeEmail(email) {
  if (!email || typeof email !== 'string') return true;
  
  const normalizedEmail = email.toLowerCase().trim();
  
  // Common fake/placeholder email patterns
  const fakePatterns = [
    /^test@/i,
    /@example\./i,
    /@test\./i,
    /@placeholder\./i,
    /@dummy\./i,
    /^noreply@/i,
    /^no-reply@/i,
    /^admin@example\./i,
    /^fake@/i,
    /^placeholder@/i,
    /^dummy@/i,
    /^temp@/i,
    /^temporary@/i,
    /@localhost/i,
    /@test\.com$/i,
    /@example\.com$/i,
    /@example\.org$/i,
    /@example\.net$/i,
  ];
  
  // Check against patterns
  for (const pattern of fakePatterns) {
    if (pattern.test(normalizedEmail)) {
      return true;
    }
  }
  
  // Check for obviously invalid emails
  if (normalizedEmail.length < 5 || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
    return true;
  }
  
  return false;
}

/**
 * Helper function to create notifications (can be called directly or via API)
 */
export async function createNotifications(applicationId, supabaseClient) {
  try {
    // Check if notifications already exist for this application
    // If they exist, update their timestamp instead of creating duplicates
    const { data: existingNotifications } = await supabaseClient
      .from('notifications')
      .select('id')
      .eq('application_id', applicationId)
      .eq('notification_type', 'new_application')
      .limit(1);

    if (existingNotifications && existingNotifications.length > 0) {
      console.log(`[Notifications] Notifications already exist for application ${applicationId}, updating timestamp`);
      
      // Update the existing notification's timestamp to now
      // IMPORTANT: Use a single timestamp to ensure consistency
      const now = new Date().toISOString();
      
      const { data: updatedNotifications, error: updateError } = await supabaseClient
        .from('notifications')
        .update({
          sent_at: now,
          created_at: now, // Update created_at to reflect new submission
          is_read: false, // Mark as unread since it's a new submission
          read_at: null,
          updated_at: now // Track when it was updated
        })
        .eq('application_id', applicationId)
        .eq('notification_type', 'new_application')
        .select('id, sent_at, created_at, updated_at, recipient_email, application_id'); // Return key fields for verification
      
      if (updateError) {
        console.error('[Notifications] Error updating existing notification timestamp:', updateError);
        return {
          success: false,
          error: 'Failed to update notification timestamp',
          details: updateError.message
        };
      }
      
      console.log(`[Notifications] Updated ${updatedNotifications?.length || 0} notification(s) timestamp:`, {
        notificationIds: updatedNotifications?.map(n => n.id),
        newSentAt: updatedNotifications?.[0]?.sent_at,
        newCreatedAt: updatedNotifications?.[0]?.created_at,
      });
      
      return { 
        success: true, 
        notificationsCreated: 0, 
        notificationsUpdated: updatedNotifications?.length || existingNotifications.length,
        updatedNotifications: updatedNotifications,
        message: 'Updated existing notification timestamp',
        skipped: false 
      };
    }

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

    console.log(`[Notifications] Creating notifications for application ${applicationId}`);
    console.log(`[Notifications] Property owner email:`, application.hoa_properties?.property_owner_email);
    console.log(`[Notifications] Application status:`, application.status);

    // Skip if draft
    if (application.status === 'draft') {
      console.log(`[Notifications] Skipping draft application ${applicationId}`);
      return { success: true, notificationsCreated: 0, message: 'Draft application, skipping notifications' };
    }

    // Skip if payment is pending (not paid yet)
    if (application.status === 'pending_payment') {
      console.log(`[Notifications] Skipping unpaid application ${applicationId}`);
      return { success: true, notificationsCreated: 0, message: 'Unpaid application, skipping notifications' };
    }

    const notifications = [];

    // 1. Notify Property Owner(s) - support multiple emails
    // NOTE: Property owners ARE staff/admin users, so they use admin accounts
    if (application.hoa_properties?.property_owner_email) {
      const originalPropertyOwnerEmails = application.hoa_properties.property_owner_email;
      
      // Parse emails (handles both single email string and comma-separated string)
      const propertyOwnerEmails = parseEmails(originalPropertyOwnerEmails);
      
      if (propertyOwnerEmails.length === 0) {
        console.log(`[Notifications] No valid property owner emails found for application ${applicationId}`);
      } else {
        console.log(`[Notifications] Processing ${propertyOwnerEmails.length} property owner email(s) for application ${applicationId}`);
        
        // Process each email
        for (const originalEmail of propertyOwnerEmails) {
          let propertyOwnerEmail = originalEmail;
          
          // Check if email starts with 'owner.' - these are staff/admin accounts, skip email sending
          const hasOwnerPrefix = propertyOwnerEmail.startsWith('owner.');
          
          // Remove "owner." prefix for processing (but remember it for email skipping)
          propertyOwnerEmail = propertyOwnerEmail.replace(/^owner\./, '');
          
          // Skip fake/placeholder emails - don't create notifications for them
          if (isFakeEmail(propertyOwnerEmail)) {
            console.log(`[Notifications] Skipping fake/placeholder email for property owner: ${propertyOwnerEmail}`);
            continue;
          }
          
          // Find user ID by email - try exact match first
          let { data: ownerProfile } = await supabaseClient
            .from('profiles')
            .select('id, email, role')
            .eq('email', propertyOwnerEmail)
            .single();

          // If not found, try case-insensitive search
          if (!ownerProfile) {
            const { data: profiles } = await supabaseClient
              .from('profiles')
              .select('id, email, role')
              .ilike('email', propertyOwnerEmail);
            
            if (profiles && profiles.length > 0) {
              ownerProfile = profiles[0];
            }
          }

          // If we found a profile, use the profile's current email instead of the stored property email
          // This ensures we use the user's current email, not an old one stored in the property
          if (ownerProfile && ownerProfile.email) {
            console.log(`[Notifications] Found profile for property owner. Using current email: ${ownerProfile.email} instead of stored: ${propertyOwnerEmail}`);
            propertyOwnerEmail = ownerProfile.email;
          }

          // Format application type for display
          const appTypeDisplay = formatApplicationType(application.application_type);
          const packageDisplay = application.package_type === 'rush' ? 'Rush' : 'Standard';
          
          // Set explicit timestamps to ensure accurate "time ago" display
          const now = new Date().toISOString();
          
          const notification = {
            application_id: applicationId,
            recipient_email: propertyOwnerEmail, // Already cleaned (owner. prefix removed above)
            recipient_name: application.hoa_properties.property_owner_name || 'Property Owner',
            recipient_user_id: ownerProfile?.id || null,
            notification_type: 'new_application',
            subject: `${appTypeDisplay} Application - ${application.property_address} | ${application.hoa_properties?.name || 'Unknown Property'}`,
            message: `New ${appTypeDisplay.toLowerCase()} application received for ${application.property_address} in ${application.hoa_properties?.name || 'Unknown Property'}. Package: ${packageDisplay}. Submitter: ${application.submitter_name || 'Unknown'}.`,
            status: 'unread',
            is_read: false,
            sent_at: now, // Explicitly set sent_at to current time
            created_at: now, // Explicitly set created_at to current time
            metadata: {
              property_address: application.property_address,
              hoa_name: application.hoa_properties?.name,
              submitter_name: application.submitter_name,
              submitter_type: application.submitter_type,
              application_type: application.application_type,
              package_type: application.package_type,
              skip_email: hasOwnerPrefix, // Flag to skip email if original had 'owner.' prefix
              original_email: originalEmail, // Store original for reference
            },
          };

          notifications.push(notification);
          console.log(`[Notifications] Added notification for property owner: ${propertyOwnerEmail} (original: ${originalEmail}, hasOwnerPrefix: ${hasOwnerPrefix})`);
        }
      }
    } else {
      console.log(`[Notifications] No property owner email found for application ${applicationId}`);
    }

    // 2. For Settlement/Closing Attorney requests, notify ALL Accounting role users
    // This ensures accounting staff are alerted even if they're not the property owner
    const isSettlementRequest = application.application_type === 'settlement_va' || 
                                 application.application_type === 'settlement_nc' ||
                                 application.submitter_type === 'settlement';
    
    if (isSettlementRequest) {
      console.log(`[Notifications] Settlement request detected - finding all accounting users for application ${applicationId}`);
      
      // Find all users with 'accounting' role
      const { data: accountingUsers, error: accountingError } = await supabaseClient
        .from('profiles')
        .select('id, email, role')
        .eq('role', 'accounting');
      
      if (accountingError) {
        console.error('[Notifications] Error fetching accounting users:', accountingError);
      } else if (accountingUsers && accountingUsers.length > 0) {
        console.log(`[Notifications] Found ${accountingUsers.length} accounting user(s) to notify`);
        
        const appTypeDisplay = formatApplicationType(application.application_type);
        const packageDisplay = application.package_type === 'rush' ? 'Rush' : 'Standard';
        const now = new Date().toISOString();
        
        // Create notifications for each accounting user
        for (const accountingUser of accountingUsers) {
          // Skip if no email
          if (!accountingUser.email || isFakeEmail(accountingUser.email)) {
            console.log(`[Notifications] Skipping accounting user with invalid email: ${accountingUser.email}`);
            continue;
          }
          
          // Skip if this accounting user is already being notified as a property owner
          const isAlreadyNotified = notifications.some(n => 
            n.recipient_email?.toLowerCase() === accountingUser.email.toLowerCase()
          );
          
          if (isAlreadyNotified) {
            console.log(`[Notifications] Accounting user ${accountingUser.email} already notified as property owner, skipping duplicate`);
            continue;
          }
          
          const notification = {
            application_id: applicationId,
            recipient_email: accountingUser.email,
            recipient_name: accountingUser.email.split('@')[0] || 'Accounting Staff',
            recipient_user_id: accountingUser.id,
            notification_type: 'new_application',
            subject: `🔴 Settlement Request - ${application.property_address} | ${application.hoa_properties?.name || 'Unknown Property'}`,
            message: `New ${appTypeDisplay.toLowerCase()} request received for ${application.property_address} in ${application.hoa_properties?.name || 'Unknown Property'}. Package: ${packageDisplay}. Submitter: ${application.submitter_name || 'Unknown'} (${application.submitter_email || 'Unknown'}).`,
            status: 'unread',
            is_read: false,
            sent_at: now,
            created_at: now,
            metadata: {
              property_address: application.property_address,
              hoa_name: application.hoa_properties?.name,
              submitter_name: application.submitter_name,
              submitter_type: application.submitter_type,
              application_type: application.application_type,
              package_type: application.package_type,
              is_accounting_notification: true, // Flag to identify accounting-specific notifications
              skip_email: false, // Accounting users should receive emails
            },
          };
          
          notifications.push(notification);
          console.log(`[Notifications] Added notification for accounting user: ${accountingUser.email}`);
        }
      } else {
        console.log(`[Notifications] No accounting users found for settlement request ${applicationId}`);
      }
    }

    // IMPORTANT: For non-settlement requests, staff/admin users do NOT receive notifications
    // Only the property owner for the specific application receives notifications (in-app + email)
    // For settlement requests, accounting users are notified above

    // Insert all notifications
    if (notifications.length > 0) {
      console.log(`[Notifications] Inserting ${notifications.length} notifications into database`);
      const { data, error } = await supabaseClient
        .from('notifications')
        .insert(notifications)
        .select();

      if (error) {
        console.error('[Notifications] Error creating notifications:', error);
        return { success: false, error: 'Failed to create notifications', details: error.message };
      }

      console.log(`[Notifications] Successfully created ${data.length} notifications for application ${applicationId}`);

      // Send email notifications to all recipients
      const emailPromises = [];
      const isMultiCommunity = application.application_type === 'multi_community';
      const isRush = application.package_type === 'rush';
      
      // Get linked properties if multi-community
      let linkedProperties = [];
      if (isMultiCommunity) {
        const { data: linkedProps } = await supabaseClient
          .from('application_properties')
          .select(`
            property_name,
            location,
            property_id
          `)
          .eq('application_id', applicationId);
        linkedProperties = linkedProps || [];
      }

      // Send emails to all notification recipients (with error handling)
      try {
        for (const notification of data) {
          // Skip if no email address
          if (!notification.recipient_email) continue;
          
          // Skip fake/placeholder emails - don't send emails to them
          if (isFakeEmail(notification.recipient_email)) {
            console.log(`[Notifications] Skipping email send to fake/placeholder email: ${notification.recipient_email}`);
            continue;
          }

          try {
            // Check if this notification should skip email (has 'owner.' prefix in original)
            // Property owners with 'owner.' prefix are staff/admin accounts - they get in-app notifications only
            const shouldSkipEmail = notification.metadata?.skip_email === true;
            
            if (shouldSkipEmail) {
              console.log(`[Notifications] Skipping email for property owner with 'owner.' prefix: ${notification.recipient_email} (staff/admin account - in-app notification only)`);
              continue;
            }
            
            // Determine if this is a property owner or staff/admin
            // Compare emails (handle owner. prefix and case sensitivity)
            // Support multiple property owner emails
            const propertyOwnerEmails = parseEmails(application.hoa_properties?.property_owner_email || '');
            const notificationEmail = notification.recipient_email?.replace(/^owner\./, '') || '';
            const isPropertyOwner = propertyOwnerEmails.some(email => {
              const cleanEmail = email.replace(/^owner\./, '');
              return cleanEmail.toLowerCase() === notificationEmail.toLowerCase();
            });
            
            console.log(`[Notifications] Checking email: ${notificationEmail}, isPropertyOwner: ${isPropertyOwner}`);
            
            // Check if this is an accounting notification for settlement request
            const isAccountingNotification = notification.metadata?.is_accounting_notification === true;
            
            // IMPORTANT: Send emails to:
            // 1. Property owners (for all application types)
            // 2. Accounting users (for settlement requests only)
            // Staff/admin (non-accounting) will still receive in-app notifications, but no emails
            if ((isPropertyOwner && application.hoa_properties) || isAccountingNotification) {
              // Send notification email
              emailPromises.push(
                sendPropertyManagerNotificationEmail({
                  to: notification.recipient_email,
                  applicationId: applicationId,
                  propertyName: application.hoa_properties?.name || 'Unknown Property',
                  propertyAddress: application.property_address,
                  submitterName: application.submitter_name || 'Unknown',
                  submitterEmail: application.submitter_email || '',
                  packageType: application.package_type,
                  isRush: isRush,
                  isMultiCommunity: isMultiCommunity,
                  linkedProperties: linkedProperties,
                  applicationType: application.application_type,
                }).catch(emailError => {
                  console.error(`Failed to send email to ${notification.recipient_email}:`, emailError);
                  // Don't throw - continue with other emails
                  return { success: false, error: emailError.message };
                })
              );
              
              if (isAccountingNotification) {
                console.log(`[Notifications] Queued email for accounting user: ${notification.recipient_email}`);
              }
            } else {
              // Staff/admin (non-accounting): Skip email, they only get in-app notifications
              console.log(`[Notifications] Skipping email for staff/admin: ${notificationEmail} (in-app notification only)`);
            }
          } catch (emailError) {
            console.error(`Error preparing email for ${notification.recipient_email}:`, emailError);
            // Continue with other emails
          }
        }
      } catch (emailLoopError) {
        console.error('Error in email sending loop:', emailLoopError);
        // Don't fail notification creation if email loop fails
      }

      // Send all emails (don't wait for them to complete - fire and forget)
      console.log(`[Notifications] Queued ${emailPromises.length} emails to send`);
      Promise.allSettled(emailPromises).then(results => {
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        console.log(`[Notifications] Email notifications sent: ${successful} successful, ${failed} failed`);
      }).catch(err => {
        console.error('[Notifications] Error in email sending promise:', err);
      });

      return {
        success: true,
        notificationsCreated: data.length,
        notifications: data,
        emailsQueued: emailPromises.length,
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

