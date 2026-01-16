import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * API endpoint to search for admin/staff/accounting users by email
 * Used for autocomplete in property owner email input
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin, staff, or accounting role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get search query parameter
    const { q = '', limit = 10 } = req.query;
    const searchTerm = (q || '').trim();
    const limitNum = Math.min(parseInt(limit) || 10, 20); // Max 20 results

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(200).json({ users: [] });
    }

    // Check if search term looks like a complete email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isCompleteEmail = emailRegex.test(searchTerm);

    // Build query - prioritize exact match if it's a complete email
    let query = supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role')
      .in('role', ['admin', 'staff', 'accounting'])
      .eq('active', true)
      .is('deleted_at', null);

    // For complete emails, try exact match first (case-insensitive)
    if (isCompleteEmail) {
      // Use ilike for case-insensitive exact match
      query = query.ilike('email', searchTerm);
    } else {
      // For partial searches, use LIKE with wildcards
      query = query.ilike('email', `%${searchTerm}%`);
    }

    const { data: users, error: queryError } = await query
      .order('email', { ascending: true })
      .limit(limitNum);

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Format response
    const formattedUsers = (users || []).map(user => ({
      id: user.id,
      email: user.email,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      role: user.role
    }));

    return res.status(200).json({ 
      users: formattedUsers,
      count: formattedUsers.length
    });

  } catch (error) {
    console.error('Search users API error:', error);
    return res.status(500).json({ 
      error: 'Failed to search users',
      message: error.message 
    });
  }
}

