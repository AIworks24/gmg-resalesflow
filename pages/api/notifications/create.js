import { createClient } from '@supabase/supabase-js';
import { sendPropertyManagerNotificationEmail } from '../../../lib/emailService';
import { parseEmails, normalizeEmail } from '../../../lib/emailUtils';

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
    // Get ALL existing notifications to check per-recipient
    const { data: existingNotifications } = await supabaseClient
      .from('notifications')
      .select('id, recipient_email')
      .eq('application_id', applicationId)
      .eq('notification_type', 'new_application');

    // Track which recipients already have notifications so we can create for new ones
    const existingRecipients = new Set(
      (existingNotifications || []).map(n => normalizeEmail(n.recipient_email))
    );
    if (existingRecipients.size > 0) {
      console.log(`[Notifications] ${existingRecipients.size} existing notification(s) for application ${applicationId}: ${[...existingRecipients].join(', ')}`);
    }

    // Get full application data and property groups for multi-community
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

    // Fetch application_property_groups for multi-community (all property owners)
    const { data: propertyGroups } = await supabaseClient
      .from('application_property_groups')
      .select('id, property_name, property_location, property_owner_email, assigned_to, is_primary, property_id, hoa_properties(property_owner_email, property_owner_name, default_assignee_email, location)')
      .eq('application_id', applicationId);

    const isMultiCommunityApp = application.hoa_properties?.is_multi_community ||
      application.application_type === 'multi_community' ||
      (application.application_type?.startsWith && application.application_type.startsWith('mc_'));

    console.log(`[Notifications] Creating notifications for application ${applicationId}`);
    console.log(`[Notifications] Property owner email:`, application.hoa_properties?.property_owner_email);
    console.log(`[Notifications] Application status:`, application.status);
    console.log(`[Notifications] Is multi-community: ${isMultiCommunityApp}, property groups: ${propertyGroups?.length || 0}`);

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

    // For MC apps: NEVER create partial notifications. Only create when property groups exist.
    // The Stripe webhook creates groups and then calls createNotifications — that's when we notify everyone.
    if (isMultiCommunityApp && (!propertyGroups || propertyGroups.length === 0)) {
      console.log(`[Notifications] MC application ${applicationId} - no property groups yet, deferring until payment webhook creates them`);
      return { success: true, notificationsCreated: 0, message: 'MC app - deferred until property groups exist' };
    }

    const notifications = [];
    const appTypeDisplay = formatApplicationType(application.application_type);
    const packageDisplay = application.package_type === 'rush' ? 'Rush' : 'Standard';

    // Collect all property owner emails (for MC: from all groups; for single: primary only)
    // Map: normalizedEmail -> { originalEmail, hasOwnerPrefix, propertyNames[], ownerName }
    const ownerEmailMap = new Map();

    const addOwnersFromSource = (emailsStr, propertyName, ownerName) => {
      if (!emailsStr) return;
      const emails = parseEmails(emailsStr);
      for (const originalEmail of emails) {
        const hasOwnerPrefix = originalEmail.startsWith('owner.');
        const cleanEmail = originalEmail.replace(/^owner\./, '');
        if (isFakeEmail(cleanEmail)) continue;
        const key = normalizeEmail(cleanEmail);
        if (!ownerEmailMap.has(key)) {
          ownerEmailMap.set(key, { originalEmail, hasOwnerPrefix, propertyNames: [], ownerName });
        }
        const entry = ownerEmailMap.get(key);
        if (propertyName && !entry.propertyNames.includes(propertyName)) {
          entry.propertyNames.push(propertyName);
        }
      }
    };

    if (isMultiCommunityApp && propertyGroups && propertyGroups.length > 0) {
      // Property groups exist — use them as the source of truth
      // Fallback: fetch linked properties when a group has no email (e.g. join failed)
      let linkedPropsFallback = null;
      const getLinkedProps = async () => {
        if (linkedPropsFallback) return linkedPropsFallback;
        try {
          const { getLinkedProperties } = await import('../../../lib/multiCommunityUtils');
          linkedPropsFallback = await getLinkedProperties(application.hoa_property_id, supabaseClient);
          return linkedPropsFallback || [];
        } catch (e) {
          console.warn('[Notifications] Could not fetch linked properties fallback:', e);
          return [];
        }
      };

      // Multi-community: notify ALL property owners (primary + each secondary)
      for (const group of propertyGroups) {
        const propName = group.property_name || group.hoa_properties?.name || application.hoa_properties?.name || 'Unknown Property';
        let ownerEmail = group.property_owner_email || group.hoa_properties?.property_owner_email ||
          group.assigned_to || group.hoa_properties?.default_assignee_email;
        const ownerName = group.hoa_properties?.property_owner_name || application.hoa_properties?.property_owner_name;

        if (!ownerEmail && group.property_id) {
          const linked = await getLinkedProps();
          const match = linked.find((lp) => lp.linked_property_id === group.property_id);
          if (match?.property_owner_email) {
            ownerEmail = match.property_owner_email;
            console.log(`[Notifications] Resolved email for "${propName}" from linked properties fallback`);
          }
        }
        if (!ownerEmail) {
          console.warn(`[Notifications] MC group "${propName}" (id: ${group.id}) has no property_owner_email - skipping`);
        }
        addOwnersFromSource(ownerEmail, propName, ownerName);
      }
      // Also add primary from hoa_properties if not already in groups (legacy)
      if (!propertyGroups.some(g => g.is_primary)) {
        addOwnersFromSource(
          application.hoa_properties?.property_owner_email,
          application.hoa_properties?.name,
          application.hoa_properties?.property_owner_name
        );
      }
      console.log(`[Notifications] Multi-community: collected ${ownerEmailMap.size} unique property owner(s) across ${propertyGroups.length} property group(s)`);
    } else {
      // Single property: primary only
      addOwnersFromSource(
        application.hoa_properties?.property_owner_email,
        application.hoa_properties?.name,
        application.hoa_properties?.property_owner_name
      );
      console.log(`[Notifications] Single property: collected ${ownerEmailMap.size} property owner(s)`);
    }

    // Create one notification per unique property owner
    for (const [normalizedEmail, { originalEmail, hasOwnerPrefix, propertyNames, ownerName }] of ownerEmailMap) {
      let propertyOwnerEmail = normalizedEmail;

      // Find user ID by email
      let { data: ownerProfile } = await supabaseClient
        .from('profiles')
        .select('id, email, role')
        .eq('email', propertyOwnerEmail)
        .single();
      if (!ownerProfile) {
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select('id, email, role')
          .ilike('email', propertyOwnerEmail);
        if (profiles?.length > 0) ownerProfile = profiles[0];
      }
      if (ownerProfile?.email) {
        propertyOwnerEmail = ownerProfile.email;
      }

      const now = new Date().toISOString();
      const primaryPropName = application.hoa_properties?.name || 'Unknown Property';
      const displayPropertyName = propertyNames?.length > 0 ? propertyNames[0] : primaryPropName;
      const subject = `${appTypeDisplay} Application - ${application.property_address} | ${displayPropertyName}`;
      const mcNote = isMultiCommunityApp ? ' Your property is part of a Multi-Community Application.' : '';
      const message = `New ${appTypeDisplay.toLowerCase()} application received for ${application.property_address} in ${displayPropertyName}. Package: ${packageDisplay}. Submitter: ${application.submitter_name || 'Unknown'}.${mcNote}`;

      const notification = {
        application_id: applicationId,
        recipient_email: normalizeEmail(propertyOwnerEmail),
        recipient_name: ownerName || 'Property Owner',
        recipient_user_id: ownerProfile?.id || null,
        notification_type: 'new_application',
        subject,
        message,
        status: 'unread',
        is_read: false,
        sent_at: now,
        created_at: now,
        metadata: {
          property_address: application.property_address,
          hoa_name: primaryPropName,
          submitter_name: application.submitter_name,
          submitter_type: application.submitter_type,
          application_type: application.application_type,
          package_type: application.package_type,
          skip_email: hasOwnerPrefix,
          original_email: originalEmail,
          is_multi_community_recipient: isMultiCommunityApp,
          recipient_property_names: propertyNames,
        },
      };
      notifications.push(notification);
      console.log(`[Notifications] Added notification for property owner: ${normalizedEmail} (properties: ${propertyNames?.join(', ') || 'primary'})`);
    }

    if (ownerEmailMap.size === 0) {
      console.log(`[Notifications] No property owner emails found for application ${applicationId}`);
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
          
          // Normalize accounting user email to lowercase for consistent storage and delivery
          const normalizedAccountingEmail = normalizeEmail(accountingUser.email);
          console.log(`[Notifications] Normalized accounting user email: ${accountingUser.email} -> ${normalizedAccountingEmail}`);
          
          // Skip if this accounting user is already being notified as a property owner
          const isAlreadyNotified = notifications.some(n => 
            normalizeEmail(n.recipient_email) === normalizedAccountingEmail
          );
          
          if (isAlreadyNotified) {
            console.log(`[Notifications] Accounting user ${normalizedAccountingEmail} already notified as property owner, skipping duplicate`);
            continue;
          }
          
          const notification = {
            application_id: applicationId,
            recipient_email: normalizedAccountingEmail, // Normalized to lowercase for consistent delivery
            recipient_name: accountingUser.email.split('@')[0] || 'Accounting Staff',
            recipient_user_id: accountingUser.id,
            notification_type: 'new_application',
            subject: `${appTypeDisplay} Application - ${application.property_address} | ${application.hoa_properties?.name || 'Unknown Property'}`,
            message: `New ${appTypeDisplay.toLowerCase()} application received for ${application.property_address} in ${application.hoa_properties?.name || 'Unknown Property'}. Package: ${packageDisplay}. Submitter: ${application.submitter_name || 'Unknown'} (${application.submitter_email || 'Unknown'}).`,
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
          console.log(`[Notifications] Added notification for accounting user: ${normalizedAccountingEmail}`);
        }
      } else {
        console.log(`[Notifications] No accounting users found for settlement request ${applicationId}`);
      }
    }

    // IMPORTANT: For non-settlement requests, staff/admin users do NOT receive notifications
    // Only the property owner for the specific application receives notifications (in-app + email)
    // For settlement requests, accounting users are notified above

    // Deduplicate notifications by recipient_email and skip recipients that already have notifications
    const uniqueNotifications = [];
    const seenEmails = new Set();
    
    for (const notification of notifications) {
      const normalizedEmail = normalizeEmail(notification.recipient_email);
      if (existingRecipients.has(normalizedEmail)) {
        console.log(`[Notifications] Skipping ${normalizedEmail} - already has notification for this application`);
        continue;
      }
      if (!seenEmails.has(normalizedEmail)) {
        seenEmails.add(normalizedEmail);
        uniqueNotifications.push(notification);
      }
    }

    // Insert all unique notifications
    if (uniqueNotifications.length > 0) {
      console.log(`[Notifications] Inserting ${uniqueNotifications.length} unique notifications into database`);
      const { data, error } = await supabaseClient
        .from('notifications')
        .insert(uniqueNotifications)
        .select();

      if (error) {
        console.error('[Notifications] Error creating notifications:', error);
        return { success: false, error: 'Failed to create notifications', details: error.message };
      }

      console.log(`[Notifications] Successfully created ${data.length} notifications for application ${applicationId}`);

      // Send email notifications to all recipients
      const emailPromises = [];
      const isMultiCommunity = isMultiCommunityApp; // Same as notification creation: MC type or MC property
      const isRush = application.package_type === 'rush';
      
      // Get linked properties for email content (all groups for MC)
      let linkedProperties = [];
      const isPropertyMultiCommunity = application.hoa_properties?.is_multi_community || false;
      if (isPropertyMultiCommunity || isMultiCommunity) {
        const groupsForEmail = propertyGroups || [];
        linkedProperties = groupsForEmail
          .filter(g => !g.is_primary)
          .map(prop => ({
            property_name: prop.property_name,
            location: prop.property_location || prop.hoa_properties?.location || '',
            property_id: prop.property_id
          }));
      }

      // Build set of all property owner emails (primary + MC groups) for email-send check
      const allPropertyOwnerEmails = new Set(ownerEmailMap ? [...ownerEmailMap.keys()] : parseEmails(application.hoa_properties?.property_owner_email || '').map(e => normalizeEmail(e.replace(/^owner\./, ''))));

      // Send emails to all notification recipients (with error handling)
      try {
        console.log(`[EMAIL_TRACE] App ${applicationId}: Starting email dispatch for ${data.length} notification(s)`);
        
        for (const notification of data) {
          // Skip if no email address
          if (!notification.recipient_email) {
            console.log(`[EMAIL_TRACE] App ${applicationId}: Skipped - no email address`);
            continue;
          }
          
          // Skip fake/placeholder emails - don't send emails to them
          if (isFakeEmail(notification.recipient_email)) {
            console.log(`[EMAIL_TRACE] App ${applicationId}: Skipped fake/placeholder email: ${notification.recipient_email}`);
            continue;
          }

          // Don't send retroactive emails. If this application already had notifications for other
          // recipients, a newly-added property owner email gets an in-app record but no email.
          // This prevents a new owner email being added to hoa_properties from receiving emails
          // for all historical applications that were submitted before they were added.
          if (existingRecipients.size > 0) {
            console.log(`[EMAIL_TRACE] App ${applicationId}: Skipped retroactive email to ${notification.recipient_email} (application already notified other recipients)`);
            continue;
          }

          try {
            // Check if this notification should skip email (has 'owner.' prefix in original)
            // Property owners with 'owner.' prefix are staff/admin - normally in-app only.
            // For MC: ALWAYS send to all property owners so each gets notified for their specific property.
            const isMCRecipientForEmail = notification.metadata?.is_multi_community_recipient === true;
            const shouldSkipEmail = !isMCRecipientForEmail && notification.metadata?.skip_email === true;
            
            if (shouldSkipEmail) {
              console.log(`[EMAIL_TRACE] App ${applicationId}: Skipped owner. prefix (in-app only): ${notification.recipient_email}`);
              continue;
            }
            
            // Determine if this is a property owner or staff/admin
            // For MC: allPropertyOwnerEmails includes primary + all group owners
            const notificationEmail = normalizeEmail(notification.recipient_email?.replace(/^owner\./, '') || '');
            const isPropertyOwner = allPropertyOwnerEmails.has(notificationEmail);
            
            console.log(`[EMAIL_TRACE] App ${applicationId}: Email check - ${notificationEmail}, isPropertyOwner: ${isPropertyOwner}, hoa_properties exists: ${!!application.hoa_properties}`);
            
            // Check if this is an accounting notification for settlement request
            const isAccountingNotification = notification.metadata?.is_accounting_notification === true;
            
            // IMPORTANT: Send emails to:
            // 1. Property owners (for all application types)
            // 2. Accounting users (for settlement requests only)
            // Staff/admin (non-accounting) will still receive in-app notifications, but no emails
            if ((isPropertyOwner && application.hoa_properties) || isAccountingNotification) {
              // Normalize email before sending to ensure consistent delivery
              const emailToSend = normalizeEmail(notification.recipient_email);
              const emailType = isAccountingNotification ? 'accounting' : 'property_owner';
              const isMCRecipient = notification.metadata?.is_multi_community_recipient === true;
              const recipientPropNames = notification.metadata?.recipient_property_names;
              const recipientPropertyName = Array.isArray(recipientPropNames) && recipientPropNames.length > 0
                ? recipientPropNames[0]
                : (application.hoa_properties?.name || null);
              
              console.log(`[EMAIL_ATTEMPT] App ${applicationId}: Attempting send to ${emailToSend} (type: ${emailType}${isMCRecipient ? ', MC recipient' : ''})`);
              
              // Send notification email
              emailPromises.push(
                sendPropertyManagerNotificationEmail({
                  to: emailToSend,
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
                  submitterType: application.submitter_type,
                  recipientPropertyName: isMCRecipient ? recipientPropertyName : null,
                  isPartOfMultiCommunityApplication: isMCRecipient,
                }).then(result => {
                  console.log(`[EMAIL_SUCCESS] App ${applicationId}: ✓ Sent to ${emailToSend}`);
                  return result;
                }).catch(emailError => {
                  console.error(`[EMAIL_FAILURE] App ${applicationId}: ✗ Failed to ${emailToSend}`, {
                    error: emailError.message,
                    stack: emailError.stack,
                    recipient: emailToSend,
                    type: emailType
                  });
                  // Don't throw - continue with other emails
                  return { success: false, error: emailError.message, recipient: emailToSend };
                })
              );
            } else {
              // Staff/admin (non-accounting): Skip email, they only get in-app notifications
              console.log(`[EMAIL_TRACE] App ${applicationId}: Skipped staff/admin (in-app only): ${notificationEmail}`);
            }
          } catch (emailError) {
            console.error(`[EMAIL_ERROR] App ${applicationId}: Error preparing email for ${notification.recipient_email}:`, emailError);
            // Continue with other emails
          }
        }
      } catch (emailLoopError) {
        console.error(`[EMAIL_ERROR] App ${applicationId}: Error in email sending loop:`, emailLoopError);
        // Don't fail notification creation if email loop fails
      }

      // Send all emails (don't wait for them to complete - fire and forget)
      console.log(`[EMAIL_DISPATCH] App ${applicationId}: Dispatched ${emailPromises.length} email(s) for async sending`);
      
      Promise.allSettled(emailPromises).then(results => {
        const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success !== false);
        const failed = results.filter(r => r.status === 'rejected' || r.value?.success === false);
        
        console.log(`[EMAIL_SUMMARY] App ${applicationId}: Complete - ${successful.length} sent, ${failed.length} failed`);
        
        // Log detailed failure information
        if (failed.length > 0) {
          failed.forEach((result, index) => {
            const failureInfo = result.status === 'rejected' 
              ? { reason: result.reason?.message || result.reason, recipient: 'unknown' }
              : { reason: result.value?.error, recipient: result.value?.recipient };
            
            console.error(`[EMAIL_FAILURE_DETAIL] App ${applicationId}: Failed email #${index + 1}:`, failureInfo);
          });
        }
      }).catch(err => {
        console.error(`[EMAIL_ERROR] App ${applicationId}: Promise handling error:`, err);
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

