import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * Debug endpoint to check notification creation and filtering
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
      .select('id, email, role, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get all notifications (for debugging)
    const { data: allNotifications, error: allError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get notifications that should match this user
    const { data: userNotifications, error: userError } = await supabase
      .from('notifications')
      .select('*')
      .or(`recipient_user_id.eq.${user.id},recipient_email.eq.${profile.email}`)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get recent applications to see if notifications were created
    const { data: recentApps, error: appsError } = await supabase
      .from('applications')
      .select(`
        id,
        property_address,
        status,
        assigned_to,
        hoa_properties (
          id,
          name,
          property_owner_email,
          property_owner_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    return res.status(200).json({
      debug: {
        user: {
          id: user.id,
          email: user.email,
        },
        profile: {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        },
        notifications: {
          total: allNotifications?.length || 0,
          all: allNotifications || [],
          forUser: userNotifications?.length || 0,
          userNotifications: userNotifications || [],
        },
        recentApplications: recentApps || [],
      },
      matchingLogic: {
        checks: [
          `recipient_user_id === '${user.id}'`,
          `recipient_email === '${profile.email}'`,
        ],
        explanation: 'Notifications match if recipient_user_id matches user.id OR recipient_email matches profile.email',
      },
    });
  } catch (error) {
    console.error('Error in debug notifications API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

