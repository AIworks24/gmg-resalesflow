/**
 * Session Cache for Offline/Disconnected Mode
 * 
 * Stores user session data locally to allow the app to function
 * when Supabase is disconnected. This provides graceful degradation.
 */

const SESSION_CACHE_KEY = 'gmg_resale_session_cache';
const SESSION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const PROFILE_CACHE_KEY = 'gmg_resale_profile_cache';

/**
 * Cache session data locally
 */
export function cacheSession(sessionData) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = {
      session: sessionData,
      timestamp: Date.now(),
      expiresAt: Date.now() + SESSION_CACHE_TTL,
    };
    
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[SessionCache] Failed to cache session:', error);
  }
}

/**
 * Get cached session data
 */
export function getCachedSession() {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    
    // Check if cache is expired
    if (Date.now() > cacheData.expiresAt) {
      clearCachedSession();
      return null;
    }
    
    return cacheData.session;
  } catch (error) {
    console.warn('[SessionCache] Failed to read cached session:', error);
    return null;
  }
}

/**
 * Clear cached session data
 */
export function clearCachedSession() {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch (error) {
    console.warn('[SessionCache] Failed to clear cached session:', error);
  }
}

/**
 * Cache user profile data
 */
export function cacheProfile(profileData) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = {
      profile: profileData,
      timestamp: Date.now(),
      expiresAt: Date.now() + SESSION_CACHE_TTL,
    };
    
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[SessionCache] Failed to cache profile:', error);
  }
}

/**
 * Get cached profile data
 */
export function getCachedProfile() {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    
    // Check if cache is expired
    if (Date.now() > cacheData.expiresAt) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    
    return cacheData.profile;
  } catch (error) {
    console.warn('[SessionCache] Failed to read cached profile:', error);
    return null;
  }
}

/**
 * Check if we have a valid cached session
 */
export function hasValidCachedSession() {
  const session = getCachedSession();
  return session !== null && session.user !== null;
}




