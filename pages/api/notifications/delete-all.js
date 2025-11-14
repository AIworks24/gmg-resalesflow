import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * API endpoint to delete all notifications for the current user
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // For admin/staff/accounting: need to delete notifications that match by:
    // 1. Direct recipient (user ID or email)
    // 2. Property owner email (for property owners logged in as admin/staff)
    // 3. Application assigned_to
    
    // First, get all notifications that should be deleted
    let notificationsToDelete = [];
    
    // Fetch all notifications (not just unread) to delete everything
    const { data: allNotifications, error: fetchError } = await supabase
      .from('notifications')
      .select(`
        *,
        application:application_id (
          assigned_to,
          hoa_properties (
            property_owner_email
          )
        )
      `)
      .is('deleted_at', null) // Only get non-deleted notifications
      .order('created_at', { ascending: false })
      .limit(1000); // Limit to prevent performance issues

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch notifications', details: fetchError.message });
    }

    // Filter to only include notifications this user can delete
    notificationsToDelete = (allNotifications || []).filter(notif => {
      // Direct recipient match
      const isDirectRecipient = 
        notif.recipient_user_id === user.id ||
        notif.recipient_email?.toLowerCase() === profile.email?.toLowerCase();
      
      // For admin/staff/accounting: also check property owner email and assigned_to
      if (profile.role === 'admin' || profile.role === 'staff' || profile.role === 'accounting') {
        const propertyOwnerEmail = notif.application?.hoa_properties?.property_owner_email;
        const isPropertyOwner = propertyOwnerEmail && 
          propertyOwnerEmail.toLowerCase() === profile.email?.toLowerCase();
        
        const assignedTo = notif.application?.assigned_to;
        const isAssigned = assignedTo && 
          assignedTo.toLowerCase() === profile.email?.toLowerCase();
        
        return isDirectRecipient || isPropertyOwner || isAssigned;
      }
      
      return isDirectRecipient;
    }).map(notif => notif.id);

    if (notificationsToDelete.length === 0) {
      return res.status(200).json({
        success: true,
        deletedCount: 0,
        message: 'No notifications to delete',
      });
    }

    // Soft delete the filtered notifications
    const { data, error } = await supabase
      .from('notifications')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .in('id', notificationsToDelete)
      .is('deleted_at', null) // Only update if not already deleted
      .select();

    if (error) {
      // If RLS blocks the update, try with service role for admin/staff/accounting
      if ((profile.role === 'admin' || profile.role === 'staff' || profile.role === 'accounting') && 
          error.message?.includes('permission denied')) {
        console.log('RLS blocked delete, using service role for admin/staff/accounting');
        
        const { createClient } = require('@supabase/supabase-js');
        const serviceSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: serviceData, error: serviceError } = await serviceSupabase
          .from('notifications')
          .update({
            deleted_at: new Date().toISOString(),
          })
          .in('id', notificationsToDelete)
          .is('deleted_at', null) // Only update if not already deleted
          .select();

        if (serviceError) {
          console.error('Error deleting notifications with service role:', serviceError);
          return res.status(500).json({ error: 'Failed to delete notifications', details: serviceError.message });
        }

        return res.status(200).json({
          success: true,
          deletedCount: serviceData.length,
          message: `Successfully deleted ${serviceData.length} notification(s)`,
        });
      }

      console.error('Error deleting notifications:', error);
      return res.status(500).json({ error: 'Failed to delete notifications', details: error.message });
    }

    return res.status(200).json({
      success: true,
      deletedCount: data.length,
      message: `Successfully deleted ${data.length} notification(s)`,
    });
  } catch (error) {
    console.error('Error in delete-all notifications API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

