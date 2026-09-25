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
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get query parameters for pagination and search
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || '';
    const sortField = req.query.sortField || 'name';
    const sortOrder = req.query.sortOrder || 'asc';
    const locationFilter = req.query.locationFilter || '';
    const typeFilter = req.query.typeFilter || '';
    // active = every non-retired property; published/draft narrow it by publish status
    const statusFilter = ['retired', 'published', 'draft'].includes(req.query.statusFilter)
      ? req.query.statusFilter
      : 'active';
    const bypassCache = req.query.bypassCache === 'true'; // Allow bypassing cache

    // Try to get from cache first (unless bypass is requested)
    // Cache key includes pagination params and user ID to prevent collisions
    const cacheKey = `admin:hoa_properties:${user.id}:page:${page}:size:${pageSize}:search:${search}:sort:${sortField}:${sortOrder}:loc:${locationFilter}:type:${typeFilter}:status:${statusFilter}`;
    
    if (!bypassCache) {
      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        console.log('✅ Properties cache HIT');
        return res.status(200).json({ 
          ...cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log('🔄 Bypassing cache - fetching fresh data');
    }

    console.log('❌ Properties cache MISS - fetching from database');

    // Cache miss - fetch from database
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build query - retired properties are the soft-deleted ones (deleted_at set)
    let query = supabase
      .from('hoa_properties')
      .select('*', { count: 'exact' });

    query = statusFilter === 'retired'
      ? query.not('deleted_at', 'is', null)
      : query.is('deleted_at', null);

    if (statusFilter === 'published' || statusFilter === 'draft') {
      query = query.eq('status', statusFilter);
    }

    // Apply search filter if provided
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,property_owner_name.ilike.%${search}%,property_owner_email.ilike.%${search}%`);
    }

    // Apply location filter
    if (locationFilter) {
      query = query.eq('location', locationFilter);
    }

    // Apply type filter
    if (typeFilter) {
      if (typeFilter === 'multi') {
        query = query.eq('is_multi_community', true);
      } else if (typeFilter === 'single') {
        query = query.eq('is_multi_community', false);
      }
    }

    // Apply sorting
    if (sortField === 'name') {
      query = query.order('name', { ascending: sortOrder === 'asc' });
    } else {
      query = query.order('name', { ascending: true });
    }

    // Apply pagination
    query = query.range(from, to);

    const { data: properties, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // A published multi-community primary is still hidden from requesters while any of its
    // linked properties is in draft — flag those so the admin list can warn about it.
    const draftLinkedByPrimary = new Map();
    const primaryIds = (properties || []).filter((p) => p.is_multi_community).map((p) => p.id);
    if (primaryIds.length > 0) {
      const { data: links } = await supabase
        .from('linked_properties')
        .select('primary_property_id, hoa_properties!linked_properties_linked_property_id_fkey(name, status)')
        .in('primary_property_id', primaryIds);
      (links || []).forEach((link) => {
        if (link.hoa_properties?.status !== 'draft') return;
        const names = draftLinkedByPrimary.get(link.primary_property_id) || [];
        names.push(link.hoa_properties.name);
        draftLinkedByPrimary.set(link.primary_property_id, names);
      });
    }

    const result = {
      properties: (properties || []).map((p) => ({
        ...p,
        draft_linked_names: draftLinkedByPrimary.get(p.id) || [],
      })),
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
