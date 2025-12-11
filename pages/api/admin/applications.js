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

    // Parse query parameters
    const { 
      page = 1, 
      limit = 1000,  // Default to high limit for backward compatibility
      status = 'all', 
      search = '',
      dateStart = null,
      dateEnd = null,
      sortBy = 'created_at',  // Default sort field
      sortOrder = 'desc',      // Default sort direction
      bypassCache = false     // For real-time refreshes
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const shouldBypassCache = bypassCache === 'true' || bypassCache === true;

    // Generate dynamic cache key based on filters (including sort parameters and user ID to prevent collisions)
    const cacheKey = `admin:applications:${user.id}:${status}:${search}:${dateStart || 'null'}:${dateEnd || 'null'}:${sortBy}:${sortOrder}:${pageNum}:${limitNum}`;
    
    // Try to get from cache first (unless bypassed for real-time updates)
    if (!shouldBypassCache) {
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        console.log('✅ Applications cache HIT:', cacheKey);
        return res.status(200).json({ 
          ...cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`❌ Applications cache ${shouldBypassCache ? 'BYPASSED (real-time refresh)' : 'MISS'} - fetching from database:`, cacheKey);

    // Build query - exclude soft-deleted applications
    let query = supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
        notifications(id, notification_type, status, sent_at),
        application_property_groups(
          id,
          is_primary,
          property_name,
          property_location,
          status,
          created_at,
          pdf_url,
          pdf_status,
          pdf_completed_at,
          email_status,
          email_completed_at,
          inspection_status,
          inspection_completed_at,
          form_data,
          hoa_properties(id, name, location)
        )
      `, { count: 'exact' })
      .is('deleted_at', null) // Only get non-deleted applications
      .neq('status', 'draft')
      .neq('status', 'pending_payment');

    // Apply role-based filtering
    if (profile.role === 'accounting') {
      // Accounting users can only see settlement applications
      query = query.or('submitter_type.eq.settlement,application_type.like.settlement%');
    }
    // Admin and staff users can see all applications (no additional filtering)

    // Apply status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply search filter
    if (search) {
      query = query.or(`property_address.ilike.%${search}%,submitter_name.ilike.%${search}%,hoa_properties.name.ilike.%${search}%`);
    }

    // Apply date range filter
    if (dateStart && dateEnd) {
      query = query
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);
    }

    // Apply sorting (validate sortBy to prevent SQL injection)
    const allowedSortFields = ['created_at', 'property_address', 'status', 'submitter_name', 'application_type'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const isAscending = sortOrder === 'asc';

    // Apply pagination and sorting
    const startIndex = (pageNum - 1) * limitNum;
    query = query
      .range(startIndex, startIndex + limitNum - 1)
      .order(validSortBy, { ascending: isAscending });

    // Execute query
    const { data: applications, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Process the data to group forms by application
    const processedApplications = (applications || []).map((app) => {
      const inspectionForm = app.property_owner_forms?.find(
        (f) => f.form_type === 'inspection_form'
      );
      const resaleCertificate = app.property_owner_forms?.find(
        (f) => f.form_type === 'resale_certificate'
      );

      return {
        ...app,
        forms: {
          inspectionForm: inspectionForm || {
            status: 'not_created',
            id: null,
          },
          resaleCertificate: resaleCertificate || {
            status: 'not_created',
            id: null,
          },
        },
        notifications: app.notifications || [],
      };
    });

    // Prepare response data
    const responseData = {
      data: processedApplications,
      count: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    };

    // Store in cache with short TTL (2 minutes) for real-time compatibility
    // Only cache if not bypassed (real-time refreshes shouldn't update cache)
    if (!shouldBypassCache) {
      await setCache(cacheKey, responseData, 120); // 2 minutes TTL
    }

    return res.status(200).json({ 
      ...responseData,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Applications API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch applications',
      message: error.message 
    });
  }
}
