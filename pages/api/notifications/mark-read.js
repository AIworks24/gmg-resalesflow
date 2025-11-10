import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * API endpoint to mark notifications as read
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

    const { notificationIds } = req.body;

    // For admin/staff/accounting: need to mark notifications that match by:
    // 1. Direct recipient (user ID or email)
    // 2. Property owner email (for property owners logged in as admin/staff)
    // 3. Application assigned_to
    
    // First, get all notifications that should be marked as read
    let notificationsToMark = [];
    
    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      // Mark specific notifications
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
        .in('id', notificationIds)
        .eq('is_read', false);

      if (fetchError) {
        console.error('Error fetching notifications:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch notifications', details: fetchError.message });
      }

      // Filter to only include notifications this user can mark as read
      notificationsToMark = (allNotifications || []).filter(notif => {
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
    } else {
      // Mark all unread notifications for this user
      const { data: allUnreadNotifications, error: fetchError } = await supabase
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
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1000); // Limit to prevent performance issues

      if (fetchError) {
        console.error('Error fetching notifications:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch notifications', details: fetchError.message });
      }

      // Filter to only include notifications this user can mark as read
      notificationsToMark = (allUnreadNotifications || []).filter(notif => {
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
    }

    if (notificationsToMark.length === 0) {
      return res.status(200).json({
        success: true,
        markedRead: 0,
        message: 'No notifications to mark as read',
      });
    }

    // Now update the filtered notifications
    // Don't update status field - only update is_read and read_at
    // Status field might have a constraint, and is_read is the primary flag anyway
    const { data, error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        // Don't update status - let it remain as 'unread' or 'sent'
        // The is_read flag is the primary indicator
      })
      .in('id', notificationsToMark)
      .select();

    if (error) {
      // If RLS blocks the update, try with service role for admin/staff/accounting
      if ((profile.role === 'admin' || profile.role === 'staff' || profile.role === 'accounting') && 
          error.message?.includes('permission denied')) {
        console.log('RLS blocked update, using service role for admin/staff/accounting');
        
        const { createClient } = require('@supabase/supabase-js');
        const serviceSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: serviceData, error: serviceError } = await serviceSupabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
            // Don't update status - let it remain as 'unread' or 'sent'
            // The is_read flag is the primary indicator
          })
          .in('id', notificationsToMark)
          .select();

        if (serviceError) {
          console.error('Error marking notifications as read with service role:', serviceError);
          return res.status(500).json({ error: 'Failed to mark notifications as read', details: serviceError.message });
        }

        return res.status(200).json({
          success: true,
          markedRead: serviceData.length,
          notifications: serviceData,
          message: notificationIds ? 'Notifications marked as read' : 'All notifications marked as read',
        });
      }

      console.error('Error marking notifications as read:', error);
      return res.status(500).json({ error: 'Failed to mark notifications as read', details: error.message });
    }

    return res.status(200).json({
      success: true,
      markedRead: data.length,
      notifications: data,
      message: notificationIds ? 'Notifications marked as read' : 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Error in mark-read notifications API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

