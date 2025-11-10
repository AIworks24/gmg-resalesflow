import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * API endpoint to get notifications for the current user
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get query parameters
    const { limit = 100, unreadOnly = false } = req.query;

    // IMPORTANT: For admin/staff/accounting who are also property owners,
    // we need to fetch ALL notifications and filter by:
    // 1. Direct recipient (user ID or email match)
    // 2. Property owner email match (even if notification was created before they logged in)
    // 3. Application assigned_to match
    
    // For admin/staff/accounting: fetch ALL notifications to check property owner matches
    // For regular users: fetch only their direct notifications
    let notifications = [];
    
    if (profile.role === 'admin' || profile.role === 'staff' || profile.role === 'accounting') {
      // Fetch ALL notifications (with a reasonable limit) to check property owner matches
      // This ensures notifications created when user was offline are still visible when they log in
      const { data: allNotifications, error: allError } = await supabase
        .from('notifications')
        .select(`
          *,
          application:application_id (
            id,
            property_address,
            status,
            submitter_name,
            submitter_type,
            application_type,
            assigned_to,
            hoa_properties (
              id,
              name,
              property_owner_email,
              property_owner_name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500); // Fetch up to 500 most recent notifications

      if (allError) {
        console.error('Error fetching all notifications:', allError);
        return res.status(500).json({ error: 'Failed to fetch notifications', details: allError.message });
      }

      // Filter notifications for this user:
      // 1. Direct recipient match (user ID or email)
      // 2. Property owner email match (for property owners logged in as admin/staff)
      // 3. Application assigned_to match
      notifications = (allNotifications || []).filter(notif => {
        // Direct recipient match
        const isDirectRecipient = 
          notif.recipient_user_id === user.id ||
          notif.recipient_email?.toLowerCase() === profile.email?.toLowerCase();
        
        // Property owner email match (CRITICAL: works even if notification was created when user was offline)
        const propertyOwnerEmail = notif.application?.hoa_properties?.property_owner_email;
        const isPropertyOwner = propertyOwnerEmail && 
          propertyOwnerEmail.toLowerCase() === profile.email?.toLowerCase();
        
        // Application assigned to user
        const assignedTo = notif.application?.assigned_to;
        const isAssigned = assignedTo && 
          assignedTo.toLowerCase() === profile.email?.toLowerCase();
        
        return isDirectRecipient || isPropertyOwner || isAssigned;
      });
    } else {
      // Regular users: fetch only their direct notifications
      let query = supabase
        .from('notifications')
        .select(`
          *,
          application:application_id (
            id,
            property_address,
            status,
            submitter_name,
            submitter_type,
            application_type,
            assigned_to,
            hoa_properties (
              id,
              name,
              property_owner_email,
              property_owner_name
            )
          )
        `)
        .or(`recipient_user_id.eq.${user.id},recipient_email.eq.${profile.email}`)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      // Filter by read status if requested
      if (unreadOnly === 'true') {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching notifications:', error);
        return res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
      }
      
      notifications = data || [];
    }
    
    // Filter by read status if requested (for admin/staff who fetched all)
    if (unreadOnly === 'true') {
      notifications = notifications.filter(notif => !notif.is_read);
    }
    
    // Sort by created_at and limit to requested limit
    notifications = notifications
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, parseInt(limit));

    // Count unread notifications (all unread, not just in the limited set)
    // For accurate count, we need to count all unread notifications matching the criteria
    let unreadCount = 0;
    if (profile.role === 'admin' || profile.role === 'staff' || profile.role === 'accounting') {
      // Fetch ALL unread notifications to count accurately
      // This ensures we count notifications created when user was offline
      const { data: allUnreadNotifications, error: unreadError } = await supabase
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
        .limit(1000); // Check up to 1000 unread notifications
      
      if (!unreadError && allUnreadNotifications) {
        // Filter unread notifications using the same logic as above
        const matchingUnread = allUnreadNotifications.filter(notif => {
          // Direct recipient match
          const isDirectRecipient = 
            notif.recipient_user_id === user.id ||
            notif.recipient_email?.toLowerCase() === profile.email?.toLowerCase();
          
          // Property owner email match
          const propertyOwnerEmail = notif.application?.hoa_properties?.property_owner_email;
          const isPropertyOwner = propertyOwnerEmail && 
            propertyOwnerEmail.toLowerCase() === profile.email?.toLowerCase();
          
          // Application assigned to user
          const assignedTo = notif.application?.assigned_to;
          const isAssigned = assignedTo && 
            assignedTo.toLowerCase() === profile.email?.toLowerCase();
          
          return isDirectRecipient || isPropertyOwner || isAssigned;
        });
        
        unreadCount = matchingUnread.length;
      } else {
        // Fallback: count from the filtered notifications we already have
        unreadCount = notifications.filter(notif => !notif.is_read).length;
      }
    } else {
      // For regular users, count unread from their direct notifications
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .or(`recipient_user_id.eq.${user.id},recipient_email.eq.${profile.email}`)
        .eq('is_read', false);
      
      unreadCount = count || 0;
    }

    return res.status(200).json({
      success: true,
      notifications: notifications || [],
      unreadCount: unreadCount,
    });
  } catch (error) {
    console.error('Error in get notifications API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

