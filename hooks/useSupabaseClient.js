import { useState, useEffect, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Hook that creates a Supabase client and automatically recreates it when auth state changes
 * This prevents stale session issues when navigating away and coming back
 * 
 * @returns {object} Supabase client
 */
export function useSupabaseClient() {
  const [clientVersion, setClientVersion] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Create supabase client (recreated when clientVersion changes)
  const supabase = useMemo(() => {
    console.log(`useSupabaseClient: Creating new Supabase client v${clientVersion}`);
    return createClientComponentClient();
  }, [clientVersion]);
  
  // Listen for auth changes and recreate client
  useEffect(() => {
    let timeoutId;
    let subscription;
    
    const handleAuthChange = (event) => {
      console.log('useSupabaseClient: Auth state changed', event);
      
      // Add small delay to avoid rapid recreations
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log('useSupabaseClient: Recreating Supabase client');
        setClientVersion(v => v + 1);
      }, 500);
    };
    
    // Wait a bit before setting up listener to avoid creating client immediately
    const setupTimeout = setTimeout(() => {
      subscription = supabase.auth.onAuthStateChange(handleAuthChange);
      setIsInitialized(true);
    }, 100);
    
    return () => {
      clearTimeout(setupTimeout);
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.data?.subscription?.unsubscribe();
    };
  }, [supabase]);
  
  const retry = () => {
    console.log('useSupabaseClient: Force refresh triggered');
    setClientVersion(v => v + 1);
  };
  
  // Expose retry function globally (for debugging/testing)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.retrySupabaseClient = retry;
    }
  }, [retry]);
  
  return { supabase, clientVersion, retry };
}

export default useSupabaseClient;
