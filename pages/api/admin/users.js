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
      .eq('email', user.email)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Parse query parameters
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Generate cache key
    const cacheKey = `admin:users:list:${pageNum}:${limitNum}`;
    
    // Try to get from cache first
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      console.log('✅ Users cache HIT:', cacheKey);
      return res.status(200).json({ 
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    console.log('❌ Users cache MISS - fetching from database:', cacheKey);

    // Calculate range for pagination
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Fetch users from database (sorted by newest first)
    const { data, error: queryError, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

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

    // Store in cache with 5-minute TTL
    await setCache(cacheKey, responseData, 300);

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
