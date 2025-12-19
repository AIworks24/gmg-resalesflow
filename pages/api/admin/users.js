import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../lib/redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Parse query parameters
    const { page = 1, limit = 10, search = '', role = '', verified = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const searchTerm = (search || '').trim();
    const roleFilter = (role || '').trim();
    const verifiedFilter = (verified || '').trim();

    // Generate cache key - includes user ID, pagination, search, and filters to prevent collisions
    const cacheKey = `admin:users:list:${user.id}:${pageNum}:${limitNum}:search:${searchTerm}:role:${roleFilter}:verified:${verifiedFilter}`;
    
    // TEMPORARILY DISABLED: Try to get from cache first
    // const cachedData = await getCache(cacheKey);

    // if (cachedData) {
    //   console.log('✅ Users cache HIT:', cacheKey);
    //   return res.status(200).json({ 
    //     ...cachedData,
    //     cached: true,
    //     timestamp: new Date().toISOString()
    //   });
    // }

    console.log('❌ Users cache MISS - fetching from database:', cacheKey);

    // Calculate range for pagination
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Build query - get all users
    // Note: Simplified to show all users regardless of active/deleted_at status
    // This ensures compatibility with various profile table schemas
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    // Apply role filter if provided
    // Support comma-separated roles (e.g., "admin,staff,accounting")
    if (roleFilter) {
      const roles = roleFilter.split(',').map(r => r.trim()).filter(r => r);
      if (roles.length === 1) {
        query = query.eq('role', roles[0]);
      } else if (roles.length > 1) {
        query = query.in('role', roles);
      }
    }

    // Apply verification status filter if provided
    if (verifiedFilter === 'verified') {
      query = query.not('email_confirmed_at', 'is', null);
    } else if (verifiedFilter === 'unverified') {
      query = query.is('email_confirmed_at', null);
    }

    // Apply search filter if provided
    if (searchTerm) {
      // Check if search term looks like an email domain (starts with @)
      if (searchTerm.startsWith('@')) {
        // Search for email domain (e.g., @specificcompany.com)
        const domain = searchTerm.substring(1); // Remove @
        query = query.ilike('email', `%@${domain}%`);
      } else {
        // Search in email, first_name, last_name, and also check for partial email matches
        // This allows searching for any part of the email, not just exact matches
        query = query.or(
          `email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`
        );
      }
    }

    // Apply ordering and pagination
    query = query.order('created_at', { ascending: false }).range(from, to);

    // Fetch users from database
    const { data, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Prepare response
    const responseData = {
      data: data || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    };

    // TEMPORARILY DISABLED: Store in cache with 5-minute TTL
    // await setCache(cacheKey, responseData, 300);

    return res.status(200).json({ 
      ...responseData,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Users API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch users',
      message: error.message 
    });
  }
}
