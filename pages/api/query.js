import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../lib/redis';
import crypto from 'crypto';

/**
 * Generic Supabase Query API Route
 * 
 * Accepts POST requests with query parameters and executes them securely
 * on the server-side with Redis caching.
 * 
 * This route eliminates the JWT token expiration bug by using server-side auth.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { table, select, options = {} } = req.body;

    // Validate required parameters
    if (!table || !select) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'table and select are required' 
      });
    }

    // Create server-side Supabase client (handles auth properly)
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated with timeout
    let user, authError;
    try {
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        )
      ]);
      user = result.data?.user;
      authError = result.error;
    } catch (err) {
      console.error('Auth check timeout or error:', err);
      return res.status(401).json({ error: 'Authentication timeout' });
    }
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if cache should be bypassed (for real-time refreshes)
    const bypassCache = options.bypassCache === true || req.query.bypassCache === 'true';

    // Generate unique cache key based on query parameters AND user ID
    // This prevents cache collisions between multiple users
    const cacheKeyData = { table, select, options, userId: user.id };
    const cacheKeyHash = crypto
      .createHash('md5')
      .update(JSON.stringify(cacheKeyData))
      .digest('hex');
    const cacheKey = `query:${table}:${cacheKeyHash}`;

    // Try to get from cache first (unless bypassed for real-time updates)
    if (!bypassCache) {
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        console.log(`✅ Query cache HIT: ${table}`);
        return res.status(200).json({ 
          data: cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`❌ Query cache ${bypassCache ? 'BYPASSED (real-time refresh)' : 'MISS'}: ${table} - fetching from database`);

    // Build the query
    let query = supabase.from(table).select(select);

    // Apply options
    if (options.eq) {
      Object.entries(options.eq).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
    }

    if (options.neq) {
      Object.entries(options.neq).forEach(([column, value]) => {
        query = query.neq(column, value);
      });
    }

    if (options.gt) {
      Object.entries(options.gt).forEach(([column, value]) => {
        query = query.gt(column, value);
      });
    }

    if (options.gte) {
      Object.entries(options.gte).forEach(([column, value]) => {
        query = query.gte(column, value);
      });
    }

    if (options.lt) {
      Object.entries(options.lt).forEach(([column, value]) => {
        query = query.lt(column, value);
      });
    }

    if (options.lte) {
      Object.entries(options.lte).forEach(([column, value]) => {
        query = query.lte(column, value);
      });
    }

    if (options.like) {
      Object.entries(options.like).forEach(([column, value]) => {
        query = query.like(column, value);
      });
    }

    if (options.ilike) {
      Object.entries(options.ilike).forEach(([column, value]) => {
        query = query.ilike(column, value);
      });
    }

    if (options.in) {
      Object.entries(options.in).forEach(([column, values]) => {
        query = query.in(column, values);
      });
    }

    if (options.or) {
      query = query.or(options.or);
    }

    if (options.order) {
      if (Array.isArray(options.order)) {
        options.order.forEach(orderClause => {
          query = query.order(orderClause.column, { 
            ascending: orderClause.ascending !== false 
          });
        });
      } else {
        query = query.order(options.order.column, { 
          ascending: options.order.ascending !== false 
        });
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.range) {
      query = query.range(options.range.from, options.range.to);
    }

    if (options.single) {
      query = query.single();
    }

    if (options.maybeSingle) {
      query = query.maybeSingle();
    }

    // Execute query
    const { data, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database query error:', queryError);
      return res.status(500).json({ 
        error: 'Database query failed',
        details: queryError.message 
      });
    }

    // Prepare response
    const response = {
      data,
      count: count !== undefined ? count : null
    };

    // Store in cache with shorter TTL for real-time compatibility (1-2 minutes)
    // Shorter TTL ensures real-time updates are fresh while still reducing DB load
    const ttl = options.cacheTTL || 120; // Default 2 minutes (was 5 minutes)
    if (options.cache !== false && !bypassCache) {
      await setCache(cacheKey, response, ttl);
    }

    return res.status(200).json({ 
      ...response,
      cached: false,
      bypassed: bypassCache,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Query API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
