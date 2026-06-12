import { createClient } from '@supabase/supabase-js';
import { parseEmails } from '../../lib/emailUtils';

/**
 * API endpoint to auto-assign an application to the property owner
 * This endpoint can be called from both client and server-side code
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

    // Initialize Supabase client with service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Auto-assign the application
    const result = await autoAssignApplication(applicationId, supabase);

    // Always return success, even if assignment didn't happen
    // This allows the application to be created/submitted even if property owner email is invalid
    return res.status(200).json({ 
      success: true, 
      message: result.message || 'Application assignment processed',
      assignedTo: result.assignedTo || null
    });
  } catch (error) {
    console.error('Error in auto-assign-application API:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to auto-assign application' 
    });
  }
}

/**
 * Helper function to auto-assign application to property owner
 * @param {number} applicationId - The application ID
 * @param {Object} supabase - Supabase client instance
 */
async function autoAssignApplication(applicationId, supabase) {
  try {
    console.log(`Attempting to auto-assign application ${applicationId} to property owner`);
    
    // Get application with property information
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        hoa_property_id,
        application_type,
        hoa_properties (
          id,
          name,
          property_owner_email,
          default_assignee_email,
          settlement_assignee_email,
          is_multi_community
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Error fetching application for auto-assignment:', appError);
      return { success: false, error: 'Application not found' };
    }

    // Skip if already assigned
    const { data: currentApp } = await supabase
      .from('applications')
      .select('assigned_to')
      .eq('id', applicationId)
      .single();

    if (currentApp?.assigned_to) {
      console.log(`Application ${applicationId} is already assigned to ${currentApp.assigned_to}, skipping auto-assignment`);
      return { success: false, error: 'Application already assigned' };
    }

    const property = application.hoa_properties;
    if (!property || !property.property_owner_email) {
      console.log(`No property owner email found for application ${applicationId}, skipping auto-assignment`);
      return { success: false, error: 'No property owner email found' };
    }

    // For settlement applications, use settlement_assignee_email if set;
    // otherwise fall back to the first email in property_owner_email.
    const isSettlement = application.application_type === 'settlement_va' ||
                         application.application_type === 'settlement_nc';
    if (isSettlement) {
      let settlementEmail = property.settlement_assignee_email?.trim();

      if (!settlementEmail) {
        const ownerEmails = parseEmails(property.property_owner_email);
        const firstOwner = ownerEmails[0]?.replace(/^owner\./, '').trim();
        if (firstOwner) {
          settlementEmail = firstOwner;
          console.log(`Settlement application: no settlement_assignee_email, falling back to first property owner: ${settlementEmail}`);
        }
      } else {
        console.log(`Settlement application detected, using settlement_assignee_email: ${settlementEmail}`);
      }

      if (!settlementEmail) {
        console.log(`Settlement application ${applicationId}: no assignee email found, leaving unassigned`);
        return { success: false, error: 'No assignee email found for settlement application' };
      }

      const { error: assignError } = await supabase
        .from('applications')
        .update({ assigned_to: settlementEmail, updated_at: new Date().toISOString() })
        .eq('id', applicationId);

      if (assignError) {
        console.error('Error assigning settlement application:', assignError);
        return { success: false, error: assignError.message };
      }

      // For MC settlement apps, assign each property group to its own settlement_assignee_email.
      // Groups may not exist yet when this runs at submission time (paid apps — groups are created
      // later by the Stripe webhook). The function is a no-op in that case and will be called
      // again from handleMultiCommunityApplication once the groups are ready.
      if (property.is_multi_community) {
        await autoAssignSettlementMCGroups(applicationId, supabase);
      }

      try {
        const { createNotifications } = await import('./notifications/create');
        await createNotifications(applicationId, supabase);
      } catch (notificationError) {
        console.warn('Error creating notifications:', notificationError);
      }

      return { success: true, assignedTo: settlementEmail };
    }

    // Parse emails (handles both single email string and comma-separated string)
    const ownerEmails = parseEmails(property.property_owner_email);

    if (ownerEmails.length === 0) {
      console.log(`No valid property owner emails found for application ${applicationId}, skipping auto-assignment`);
      return { success: false, error: 'No valid property owner emails found' };
    }

    // Build ordered list: default assignee first (if set and in list), then the rest
    const defaultEmail = (property.default_assignee_email || '').trim().toLowerCase();
    const defaultInList = defaultEmail && ownerEmails.some(e => (e || '').trim().toLowerCase() === defaultEmail);
    const orderedEmails = defaultInList
      ? [
          ownerEmails.find(e => (e || '').trim().toLowerCase() === defaultEmail),
          ...ownerEmails.filter(e => (e || '').trim().toLowerCase() !== defaultEmail)
        ]
      : ownerEmails;

    console.log(`Trying ${orderedEmails.length} email(s) for application ${applicationId} (${property.is_multi_community ? 'MC' : 'single'})`);

    // Try each email in order until we find a valid staff/admin/accounting user
    const allowedRoles = ['staff', 'admin', 'accounting'];
    let assignedEmail = null;

    for (const rawEmail of orderedEmails) {
      if (!rawEmail) continue;
      const emailToTry = rawEmail.replace(/^owner\./, '').trim();
      if (!emailToTry) continue;

      // Exact match first, then case-insensitive fallback
      let { data: profile } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', emailToTry)
        .single();

      if (!profile) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .ilike('email', emailToTry);
        if (profiles && profiles.length > 0) profile = profiles[0];
      }

      if (profile && allowedRoles.includes(profile.role)) {
        assignedEmail = profile.email;
        console.log(`Found valid assignee: ${assignedEmail} (role: ${profile.role})`);
        break;
      } else if (profile) {
        console.log(`Skipping ${emailToTry}: role "${profile.role}" not allowed`);
      } else {
        console.log(`Skipping ${emailToTry}: no profile found`);
      }
    }

    if (!assignedEmail) {
      console.log(`No valid staff/admin/accounting user found among ${orderedEmails.length} email(s) for application ${applicationId}. Leaving unassigned.`);
      return {
        success: true,
        assignedTo: null,
        message: 'No valid staff user found among property owner emails. Application left unassigned.'
      };
    }

    const ownerEmail = assignedEmail;
    console.log(`Verified property owner user: ${ownerEmail}`);

    // Assign the application to the property owner
    const { error: assignError } = await supabase
      .from('applications')
      .update({ 
        assigned_to: ownerEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (assignError) {
      console.error('Error assigning application:', assignError);
      return { success: false, error: assignError.message };
    }

    console.log(`Successfully auto-assigned application ${applicationId} to property owner: ${ownerEmail}`);
    
    // Create notifications for property owner and staff/admin
    try {
      // Import and call the notification creation function directly
      const { createNotifications } = await import('./notifications/create');
      await createNotifications(applicationId, supabase);
    } catch (notificationError) {
      // Don't fail assignment if notification creation fails
      console.warn('Error creating notifications:', notificationError);
    }
    
    return { success: true, assignedTo: ownerEmail };
  } catch (error) {
    console.error('Error in auto-assign application:', error);
    return { success: false, error: error.message };
  }
}

/**
 * For a multi-community settlement application, assigns each property group to the
 * settlement_assignee_email configured on that group's hoa_property.
 * Safe to call when groups don't exist yet — it simply returns without error.
 */
async function autoAssignSettlementMCGroups(applicationId, supabase) {
  try {
    const { data: groups } = await supabase
      .from('application_property_groups')
      .select('id, property_id, is_primary, property_name')
      .eq('application_id', applicationId);

    if (!groups || groups.length === 0) {
      console.log(`[MC Settlement] No property groups found for application ${applicationId} — skipping group assignment`);
      return;
    }

    console.log(`[MC Settlement] Assigning ${groups.length} property group(s) for application ${applicationId}`);

    for (const group of groups) {
      const { data: prop } = await supabase
        .from('hoa_properties')
        .select('settlement_assignee_email, property_owner_email')
        .eq('id', group.property_id)
        .single();

      let settlementEmail = prop?.settlement_assignee_email?.trim();
      if (!settlementEmail) {
        const ownerEmails = parseEmails(prop?.property_owner_email || '');
        const firstOwner = ownerEmails[0]?.replace(/^owner\./, '').trim();
        if (firstOwner) {
          settlementEmail = firstOwner;
          console.log(`[MC Settlement] No settlement_assignee_email for property ${group.property_id} (${group.property_name}), falling back to first property owner: ${settlementEmail}`);
        } else {
          console.log(`[MC Settlement] No assignee email found for property ${group.property_id} (${group.property_name}), skipping`);
          continue;
        }
      }

      const { error } = await supabase
        .from('application_property_groups')
        .update({ assigned_to: settlementEmail, updated_at: new Date().toISOString() })
        .eq('id', group.id);

      if (error) {
        console.warn(`[MC Settlement] Failed to assign group ${group.id} to ${settlementEmail}:`, error.message);
      } else {
        console.log(`[MC Settlement] Assigned group ${group.id} (${group.property_name}) to ${settlementEmail}`);
      }
    }
  } catch (error) {
    console.warn('[MC Settlement] Error in autoAssignSettlementMCGroups:', error.message);
  }
}

// Export the function for use in other modules
export { autoAssignApplication, autoAssignSettlementMCGroups };

