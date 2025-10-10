import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../lib/redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client (handles auth properly)
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin or staff role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!profile || !['admin', 'staff'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get query parameters for pagination and search
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || '';

    // Try to get from cache first (cache key includes pagination params)
    const cacheKey = `admin:hoa_properties:page:${page}:size:${pageSize}:search:${search}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      console.log('✅ Properties cache HIT');
      return res.status(200).json({ 
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    console.log('❌ Properties cache MISS - fetching from database');

    // Cache miss - fetch from database
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build query
    let query = supabase
      .from('hoa_properties')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true });

    // Apply search filter if provided
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,property_owner_name.ilike.%${search}%,property_owner_email.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(from, to);

    const { data: properties, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    const result = {
      properties: properties || [],
      totalCount: count || 0,
      page,
      pageSize
    };

    // Store in cache with 5-minute TTL
    await setCache(cacheKey, result, 300);

    return res.status(200).json({ 
      ...result,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Properties API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch properties',
      message: error.message 
    });
  }
}
