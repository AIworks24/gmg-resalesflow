import { createClient } from '@supabase/supabase-js';

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
        hoa_properties (
          id,
          name,
          property_owner_email,
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

    let ownerEmail = property.property_owner_email;

    // For multi-community applications, use the primary property's owner email
    // (The primary property is the one in hoa_property_id, which is already what we have)
    if (property.is_multi_community) {
      console.log(`Multi-community application detected, using primary property owner: ${ownerEmail}`);
    } else {
      console.log(`Single property application, using property owner: ${ownerEmail}`);
    }

    // Check if a user exists with this email in the profiles table
    // Property owners must have role: staff, admin, or accounting
    // Try exact match first
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', ownerEmail)
      .single();

    // If not found, try case-insensitive search
    if (profileError || !profile) {
      const { data: profiles, error: searchError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .ilike('email', ownerEmail);
      
      if (!searchError && profiles && profiles.length > 0) {
        profile = profiles[0];
        profileError = null;
        console.log(`Found user with case-insensitive email match: ${profile.email}`);
      }
    }

    if (profileError || !profile) {
      // Property owner email doesn't exist in the system - this is okay, just leave it unassigned
      // This handles cases where fake/placeholder emails were used when creating properties
      console.log(`No user found with email ${ownerEmail} for application ${applicationId}. Leaving application unassigned.`);
      return { 
        success: true, 
        assignedTo: null,
        message: `Property owner email "${ownerEmail}" does not correspond to a user account. Application left unassigned.`
      };
    }

    // Verify the user has the correct role (staff, admin, or accounting)
    const allowedRoles = ['staff', 'admin', 'accounting'];
    if (!allowedRoles.includes(profile.role)) {
      // User exists but doesn't have admin access - leave it unassigned
      // This handles cases where property owner email exists but user doesn't have the right role
      console.log(`User ${ownerEmail} has role "${profile.role}" but property owners must be staff, admin, or accounting. Leaving application unassigned.`);
      return {
        success: true,
        assignedTo: null,
        message: `Property owner email "${ownerEmail}" exists but user has role "${profile.role}" (not staff/admin/accounting). Application left unassigned.`
      };
    }

    console.log(`Verified property owner user: ${ownerEmail} with role: ${profile.role}`);

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

// Export the function for use in other modules
export { autoAssignApplication };

