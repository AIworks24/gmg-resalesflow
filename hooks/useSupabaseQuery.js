import useSWR from 'swr';
import crypto from 'crypto';
import React from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Custom hook for Supabase queries with automatic caching and error handling
 * 
 * This hook eliminates the JWT token expiration bug by using server-side API routes.
 * It provides automatic retries, proper error states, and Redis caching.
 * 
 * @param {string} table - The table name to query
 * @param {string} select - The select string (e.g., '*' or 'id, name, email')
 * @param {object} options - Query options (filters, ordering, etc.)
 * @param {object} swrOptions - SWR configuration options
 * @returns {object} { data, error, isLoading, mutate }
 * 
 * @example
 * const { data, error, isLoading, mutate } = useSupabaseQuery(
 *   'applications',
 *   '*, hoa_properties(name)',
 *   { 
 *     order: { column: 'created_at', ascending: false },
 *     limit: 10 
 *   }
 * );
 */
export function useSupabaseQuery(table, select, options = {}, swrOptions = {}) {
  // Generate unique cache key for this query
  // Add timestamp to force refetch after auth state changes
  const cacheKeyData = { table, select, options };
  const cacheKeyHash = crypto
    .createHash('md5')
    .update(JSON.stringify(cacheKeyData))
    .digest('hex');
  
  // Add a version to force cache invalidation on meaningful auth changes
  const [authVersion, setAuthVersion] = React.useState(0);
  
  // Listen for auth state changes - but only meaningful ones
  React.useEffect(() => {
    const supabase = createClientComponentClient();
    let debounceTimeout = null;
    let lastUserId = null;
    
    // Initialize lastUserId from current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      lastUserId = session?.user?.id || null;
    });
    
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id || null;
      
      // Only respond to meaningful auth events, not TOKEN_REFRESHED
      // TOKEN_REFRESHED happens automatically and shouldn't invalidate cache
      if (event === 'TOKEN_REFRESHED') {
        // Check if user actually changed
        if (currentUserId === lastUserId) {
          // Same user, token just refreshed - don't invalidate cache
          return;
        }
        // User changed on token refresh (unusual) - will handle in debounced callback
      }
      
      // Debounce to prevent rapid-fire cache invalidations
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      
      debounceTimeout = setTimeout(() => {
        // Update lastUserId after processing
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          lastUserId = currentUserId;
        } else if (event === 'SIGNED_OUT') {
          lastUserId = null;
        }
        
        // Only invalidate on actual sign in/out events
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          console.log(`[useSupabaseQuery] ${event} - invalidating cache for ${table}`);
          setAuthVersion(v => v + 1);
        } else if (event === 'TOKEN_REFRESHED') {
          // This should never trigger since we return early above, but just in case
          console.log(`[useSupabaseQuery] Token refreshed with user change - invalidating cache for ${table}`);
          setAuthVersion(v => v + 1);
        }
      }, 500); // 500ms debounce
    });
    
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      subscription.data?.subscription?.unsubscribe();
    };
  }, [table]);
  
  const cacheKey = `supabase:${table}:${cacheKeyHash}:v${authVersion}`;

  // Fetcher function that calls our generic API route
  const fetcher = async () => {
    console.log(`[useSupabaseQuery] Fetching ${table}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table,
          select,
          options,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json();
        console.error(`[useSupabaseQuery] Error fetching ${table}:`, errorData);
        const error = new Error(errorData.error || 'Failed to fetch data');
        error.status = res.status;
        error.info = errorData;
        throw error;
      }

      const result = await res.json();
      console.log(`[useSupabaseQuery] Successfully fetched ${table}`);
      return result.data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error(`[useSupabaseQuery] Request timeout for ${table}`);
        throw new Error('Request timeout. Please check your connection.');
      }
      throw err;
    }
  };

  // Default SWR options
  const defaultSwrOptions = {
    refreshInterval: 0, // No auto-refresh by default
    revalidateOnFocus: true, // Refetch when window regains focus
    revalidateOnMount: true, // Always refetch on mount
    revalidateOnReconnect: true, // CRITICAL: Refetch when browser reconnects after being away
    dedupingInterval: 0, // No deduping - always fetch fresh data
    ...swrOptions,
  };

  // Use SWR with the cache key and fetcher
  const { data, error, isLoading, mutate } = useSWR(
    cacheKey,
    fetcher,
    defaultSwrOptions
  );

  return {
    data: data || null,
    error,
    isLoading,
    mutate,
  };
}

/**
 * Hook variant for queries that should return a single record
 * 
 * @example
 * const { data: user, error, isLoading } = useSupabaseQuerySingle(
 *   'profiles',
 *   '*',
 *   { eq: { email: 'user@example.com' } }
 * );
 */
export function useSupabaseQuerySingle(table, select, options = {}, swrOptions = {}) {
  const queryOptions = {
    ...options,
    single: true,
  };

  return useSupabaseQuery(table, select, queryOptions, swrOptions);
}

/**
 * Hook variant for queries with count
 * 
 * @example
 * const { data, count, error, isLoading } = useSupabaseQueryWithCount(
 *   'applications',
 *   '*',
 *   { order: { column: 'created_at', ascending: false } }
 * );
 */
export function useSupabaseQueryWithCount(table, select, options = {}, swrOptions = {}) {
  const result = useSupabaseQuery(table, select, options, swrOptions);
  
  return {
    ...result,
    count: result.data?.count || 0,
  };
}

export default useSupabaseQuery;
